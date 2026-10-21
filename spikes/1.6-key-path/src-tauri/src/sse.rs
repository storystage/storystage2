//! Server-sent events: turns the Messages API's stream of bytes into JSON events.

use serde_json::Value;

#[derive(Default)]
pub struct SseParser {
    buffer: String,
}

impl SseParser {
    /// Adds bytes from the network and returns every event they complete.
    pub fn push(&mut self, bytes: &[u8]) -> Vec<Value> {
        self.buffer.push_str(&String::from_utf8_lossy(bytes).replace("\r\n", "\n"));
        let mut events = Vec::new();
        while let Some(end) = self.buffer.find("\n\n") {
            let block: String = self.buffer.drain(..end + 2).collect();
            let data: Vec<&str> = block
                .lines()
                .filter_map(|l| l.strip_prefix("data:"))
                .map(|d| d.strip_prefix(' ').unwrap_or(d))
                .collect();
            if data.is_empty() {
                continue;
            }
            if let Ok(v) = serde_json::from_str::<Value>(&data.join("\n")) {
                events.push(v);
            }
        }
        events
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_events_split_across_chunks() {
        let mut p = SseParser::default();
        assert!(p.push(b"event: message_start\ndata: {\"type\":\"mess").is_empty());
        let events = p.push(b"age_start\"}\n\nevent: ping\ndata: {\"type\":\"ping\"}\n\n");
        assert_eq!(events.len(), 2);
        assert_eq!(events[0]["type"], "message_start");
        assert_eq!(events[1]["type"], "ping");
    }

    #[test]
    fn handles_crlf_and_ignores_comments() {
        let mut p = SseParser::default();
        let events = p.push(b": keep-alive\r\n\r\ndata: {\"type\":\"message_stop\"}\r\n\r\n");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["type"], "message_stop");
    }
}
