//! Spike 24.3, option B (the classroom relay): the parts of a relay that a school network
//! decides, measured with nothing else in the way. See `docs/spikes/24.3-classroom-relay.md`.
//!
//! - **The class code** carries the teacher's device's address, its port and a secret, so a
//!   pupil types (or scans) one code and needs no discovery that a network might block.
//! - **The handshake** proves each side knows the secret, without sending it: the listener sends
//!   a random challenge, the pupil answers with an HMAC of it, and the listener answers back.
//! - **Echo and stream** measure what a streamed Prompter reply would see: round trips, small
//!   messages spaced like a reply's events, and a megabyte at full speed.
//! - **Broadcast** checks whether a device could find the teacher's without a code.

use std::io::{self, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4, TcpListener, TcpStream, UdpSocket};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

/// Where a listener answers broadcasts. The TCP port is whatever the system gives.
pub const DISCOVERY_PORT: u16 = 47_801;
const DISCOVERY_ASK: &[u8] = b"STORYSTAGE-RELAY-PROBE?";
const DISCOVERY_ANSWER: &[u8] = b"STORYSTAGE-RELAY-PROBE!";

/// Crockford's base 32: no I, L, O or U, so a code read aloud or copied from a board survives.
const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// What a class code carries. The secret is 48 bits here: enough to show the handshake, not
/// enough for a real relay, whose code would come with a QR code carrying 128 bits.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ClassCode {
    pub ip: Ipv4Addr,
    pub port: u16,
    pub secret: [u8; 6],
}

impl ClassCode {
    /// 12 bytes as 20 characters, in groups of four: `XXXX-XXXX-XXXX-XXXX-XXXX`.
    pub fn encode(&self) -> String {
        let mut bytes = Vec::with_capacity(12);
        bytes.extend_from_slice(&self.ip.octets());
        bytes.extend_from_slice(&self.port.to_be_bytes());
        bytes.extend_from_slice(&self.secret);
        let mut bits: u128 = 0;
        for byte in &bytes {
            bits = (bits << 8) | u128::from(*byte);
        }
        bits <<= 4; // 96 bits, padded to 100: twenty characters of five bits.
        let mut text = String::new();
        for index in 0..20 {
            if index > 0 && index % 4 == 0 {
                text.push('-');
            }
            let value = ((bits >> (95 - index * 5)) & 31) as usize;
            text.push(ALPHABET[value] as char);
        }
        text
    }

    /// Reads a code back, ignoring dashes, spaces and case, and the letters people mistake for
    /// digits (O for 0, I and L for 1).
    pub fn decode(text: &str) -> Option<Self> {
        let mut bits: u128 = 0;
        let mut count = 0;
        for character in text.chars() {
            let character = match character.to_ascii_uppercase() {
                '-' | ' ' => continue,
                'O' => '0',
                'I' | 'L' => '1',
                other => other,
            };
            let value = ALPHABET.iter().position(|&a| a as char == character)?;
            bits = (bits << 5) | value as u128;
            count += 1;
        }
        if count != 20 {
            return None;
        }
        let bits = bits >> 4;
        let bytes: Vec<u8> = (0..12).rev().map(|shift| (bits >> (shift * 8)) as u8).collect();
        Some(Self {
            ip: Ipv4Addr::new(bytes[0], bytes[1], bytes[2], bytes[3]),
            port: u16::from_be_bytes([bytes[4], bytes[5]]),
            secret: bytes[6..12].try_into().ok()?,
        })
    }
}

/// Unpredictable enough for a probe: the time, the process and a counter, hashed.
pub fn random_bytes<const N: usize>() -> [u8; N] {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNT: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let digest = Sha256::new()
        .chain_update(nanos.to_be_bytes())
        .chain_update(std::process::id().to_be_bytes())
        .chain_update(COUNT.fetch_add(1, Ordering::Relaxed).to_be_bytes())
        .finalize();
    let mut out = [0u8; N];
    out.copy_from_slice(&digest[..N]);
    out
}

fn proof(secret: &[u8], challenge: &[u8], side: &[u8]) -> [u8; 32] {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("any key length");
    mac.update(side);
    mac.update(challenge);
    mac.finalize().into_bytes().into()
}

/// The address other devices on the network would reach: the one the system would send from.
/// No packet is sent. `None` with no network, when `--ip` is needed.
pub fn local_ip() -> Option<Ipv4Addr> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("192.0.2.1:9").ok()?;
    match socket.local_addr().ok()? {
        SocketAddr::V4(address) if !address.ip().is_unspecified() => Some(*address.ip()),
        _ => None,
    }
}

const ECHOES: usize = 20;
const EVENTS: usize = 50;
const EVENT_GAP: Duration = Duration::from_millis(20);
const BULK: usize = 1024 * 1024;

/// The listener's side of one connection: the handshake, then echo, events and bulk.
pub fn serve(mut stream: TcpStream, secret: &[u8]) -> io::Result<bool> {
    stream.set_read_timeout(Some(Duration::from_secs(10)))?;
    stream.set_nodelay(true)?;
    let challenge: [u8; 16] = random_bytes();
    stream.write_all(&challenge)?;
    let mut answer = [0u8; 32];
    stream.read_exact(&mut answer)?;
    if answer != proof(secret, &challenge, b"pupil") {
        stream.write_all(&[0])?;
        return Ok(false);
    }
    stream.write_all(&[1])?;
    stream.write_all(&proof(secret, &challenge, b"teacher"))?;

    let mut byte = [0u8; 1];
    for _ in 0..ECHOES {
        stream.read_exact(&mut byte)?;
        stream.write_all(&byte)?;
    }
    for index in 0..EVENTS {
        let sent = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_micros() as u64).unwrap_or(0);
        let mut event = [0u8; 64];
        event[..8].copy_from_slice(&(index as u64).to_be_bytes());
        event[8..16].copy_from_slice(&sent.to_be_bytes());
        stream.write_all(&event)?;
        std::thread::sleep(EVENT_GAP);
    }
    let chunk = [7u8; 16 * 1024];
    for _ in 0..BULK / chunk.len() {
        stream.write_all(&chunk)?;
    }
    stream.read_exact(&mut byte)?;
    Ok(true)
}

/// What a pupil's device found.
#[derive(Debug, Default)]
pub struct Report {
    pub broadcast_answered: Option<bool>,
    pub connected: bool,
    pub connect_ms: Option<f64>,
    pub teacher_proved: bool,
    pub pupil_accepted: bool,
    pub echo_median_ms: Option<f64>,
    pub echo_max_ms: Option<f64>,
    pub events_worst_gap_ms: Option<f64>,
    pub bulk_mbit_per_s: Option<f64>,
    pub error: Option<String>,
}

fn millis(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1000.0
}

/// Asks the network who's listening. `true` if a listener answered within the wait.
pub fn ask_broadcast(wait: Duration) -> io::Result<bool> {
    let socket = UdpSocket::bind("0.0.0.0:0")?;
    socket.set_broadcast(true)?;
    socket.set_read_timeout(Some(wait))?;
    socket.send_to(DISCOVERY_ASK, SocketAddrV4::new(Ipv4Addr::BROADCAST, DISCOVERY_PORT))?;
    let mut buffer = [0u8; 64];
    match socket.recv_from(&mut buffer) {
        Ok((size, _)) => Ok(buffer[..size].starts_with(DISCOVERY_ANSWER)),
        Err(error) if matches!(error.kind(), io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut) => Ok(false),
        Err(error) => Err(error),
    }
}

/// Answers broadcasts, for as long as the listener runs.
pub fn answer_broadcasts() -> io::Result<()> {
    let socket = UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT))?;
    let mut buffer = [0u8; 64];
    loop {
        let (size, from) = socket.recv_from(&mut buffer)?;
        if &buffer[..size] == DISCOVERY_ASK {
            let _ = socket.send_to(DISCOVERY_ANSWER, from);
        }
    }
}

/// The pupil's side: connect by the code, prove the secret, and measure.
pub fn probe(code: &ClassCode, broadcast: bool) -> Report {
    let mut report = Report::default();
    if broadcast {
        report.broadcast_answered = ask_broadcast(Duration::from_secs(2)).ok();
    }
    if let Err(error) = measure(code, &mut report) {
        report.error = Some(error.to_string());
    }
    report
}

fn measure(code: &ClassCode, report: &mut Report) -> io::Result<()> {
    let address = SocketAddr::V4(SocketAddrV4::new(code.ip, code.port));
    let start = Instant::now();
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(5))?;
    report.connected = true;
    report.connect_ms = Some(millis(start.elapsed()));
    stream.set_read_timeout(Some(Duration::from_secs(10)))?;
    stream.set_nodelay(true)?;

    let mut challenge = [0u8; 16];
    stream.read_exact(&mut challenge)?;
    stream.write_all(&proof(&code.secret, &challenge, b"pupil"))?;
    let mut accepted = [0u8; 1];
    stream.read_exact(&mut accepted)?;
    report.pupil_accepted = accepted[0] == 1;
    if !report.pupil_accepted {
        return Ok(());
    }
    let mut teacher = [0u8; 32];
    stream.read_exact(&mut teacher)?;
    report.teacher_proved = teacher == proof(&code.secret, &challenge, b"teacher");
    if !report.teacher_proved {
        return Ok(());
    }

    let mut times = Vec::with_capacity(ECHOES);
    let mut byte = [0u8; 1];
    for index in 0..ECHOES {
        let sent = Instant::now();
        stream.write_all(&[index as u8])?;
        stream.read_exact(&mut byte)?;
        times.push(millis(sent.elapsed()));
    }
    times.sort_by(|a, b| a.total_cmp(b));
    report.echo_median_ms = Some(times[ECHOES / 2]);
    report.echo_max_ms = times.last().copied();

    let mut event = [0u8; 64];
    let mut last: Option<Instant> = None;
    let mut worst = 0.0f64;
    for _ in 0..EVENTS {
        stream.read_exact(&mut event)?;
        let now = Instant::now();
        if let Some(previous) = last {
            worst = worst.max(millis(now - previous));
        }
        last = Some(now);
    }
    report.events_worst_gap_ms = Some(worst);

    let start = Instant::now();
    let mut buffer = vec![0u8; 16 * 1024];
    let mut received = 0;
    while received < BULK {
        let size = stream.read(&mut buffer)?;
        if size == 0 {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "the listener closed early"));
        }
        received += size;
    }
    report.bulk_mbit_per_s = Some((BULK as f64 * 8.0 / 1_000_000.0) / start.elapsed().as_secs_f64());
    stream.write_all(&[1])?;
    Ok(())
}

/// Starts a listener on `ip`, on a port the system gives, and returns its code and socket.
pub fn listen(ip: Ipv4Addr) -> io::Result<(ClassCode, TcpListener)> {
    let listener = TcpListener::bind(("0.0.0.0", 0))?;
    let port = listener.local_addr()?.port();
    Ok((ClassCode { ip, port, secret: random_bytes() }, listener))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_code_reads_back_as_written_even_misread() {
        let code = ClassCode { ip: Ipv4Addr::new(10, 42, 7, 130), port: 51_234, secret: [1, 2, 3, 250, 251, 252] };
        let text = code.encode();
        assert_eq!(text.len(), 24);
        assert_eq!(ClassCode::decode(&text), Some(code));
        let sloppy = text.to_lowercase().replace('-', " ").replace('0', "o").replace('1', "l");
        assert_eq!(ClassCode::decode(&sloppy), Some(code));
        assert_eq!(ClassCode::decode("ABCD"), None);
        assert_eq!(ClassCode::decode(&text.replace(text.chars().nth(5).unwrap(), "U")), None);
    }

    #[test]
    fn a_pupil_with_the_code_gets_through_and_measures() {
        let (code, listener) = listen(Ipv4Addr::LOCALHOST).unwrap();
        let secret = code.secret;
        let server = std::thread::spawn(move || serve(listener.accept().unwrap().0, &secret).unwrap());
        let report = probe(&code, false);
        assert!(server.join().unwrap());
        assert!(report.connected && report.pupil_accepted && report.teacher_proved, "{report:?}");
        assert!(report.bulk_mbit_per_s.unwrap() > 0.0);
        assert!(report.events_worst_gap_ms.is_some());
    }

    #[test]
    fn a_wrong_secret_is_turned_away() {
        let (code, listener) = listen(Ipv4Addr::LOCALHOST).unwrap();
        let secret = code.secret;
        let server = std::thread::spawn(move || serve(listener.accept().unwrap().0, &secret).unwrap());
        let wrong = ClassCode { secret: [9; 6], ..code };
        let report = probe(&wrong, false);
        assert!(!server.join().unwrap());
        assert!(report.connected && !report.pupil_accepted && !report.teacher_proved);
    }
}
