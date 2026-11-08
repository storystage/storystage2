//! Server-sent events: turns the Messages API's stream of bytes into JSON events. It works on
//! bytes, because a network chunk can end in the middle of a letter.

use serde_json::Value;

#[derive(Debug, Default)]
pub struct SseParser {
    buffer: Vec<u8>,
}

/// Where the first blank line ends, if there is one yet.
fn block_end(bytes: &[u8]) -> Option<usize> {
    let lf = bytes.windows(2).position(|pair| pair == b"\n\n").map(|at| at + 2);
    let crlf = bytes.windows(4).position(|four| four == b"\r\n\r\n").map(|at| at + 4);
    match (lf, crlf) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (a, b) => a.or(b),
    }
}

impl SseParser {
    /// Adds bytes from the network and returns every event they complete.
    pub fn push(&mut self, bytes: &[u8]) -> Vec<Value> {
        self.buffer.extend_from_slice(bytes);
        let mut events = Vec::new();
        while let Some(end) = block_end(&self.buffer) {
            let block: Vec<u8> = self.buffer.drain(..end).collect();
            let text = String::from_utf8_lossy(&block);
            let data: Vec<&str> = text
                .lines()
                .filter_map(|line| line.strip_prefix("data:"))
                .map(|data| data.strip_prefix(' ').unwrap_or(data))
                .collect();
            if data.is_empty() {
                continue;
            }
            if let Ok(event) = serde_json::from_str::<Value>(&data.join("\n")) {
                events.push(event);
            }
        }
        events
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn events_split_across_chunks() {
        let mut parser = SseParser::default();
        assert!(parser.push(b"event: message_start\ndata: {\"type\":\"mess").is_empty());
        let events = parser.push(b"age_start\"}\n\nevent: ping\ndata: {\"type\":\"ping\"}\n\n");
        assert_eq!(events.len(), 2);
        assert_eq!(events[0]["type"], "message_start");
        assert_eq!(events[1]["type"], "ping");
    }

    #[test]
    fn crlf_and_comments() {
        let mut parser = SseParser::default();
        let events = parser.push(b": keep-alive\r\n\r\ndata: {\"type\":\"message_stop\"}\r\n\r\n");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["type"], "message_stop");
    }

    #[test]
    fn a_letter_split_between_chunks_stays_whole() {
        let bytes = "data: {\"text\":\"caf\u{e9} \u{1F989}\"}\n\n".as_bytes();
        for split in 1..bytes.len() {
            let mut parser = SseParser::default();
            let mut events = parser.push(&bytes[..split]);
            events.extend(parser.push(&bytes[split..]));
            assert_eq!(events.len(), 1, "split at {split}");
            assert_eq!(events[0]["text"], "caf\u{e9} \u{1F989}", "split at {split}");
        }
    }

    #[test]
    fn a_line_that_is_not_json_is_skipped() {
        let mut parser = SseParser::default();
        let events = parser.push(b"data: not json\n\ndata: {\"type\":\"ping\"}\n\n");
        assert_eq!(events.len(), 1);
    }
}
