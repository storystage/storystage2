//! `relay-probe`: spike 24.3's network test, for the owner to run on a school network.
//!
//!   relay-probe listen [--ip 192.168.1.20]   on the teacher's device: shows a class code
//!   relay-probe connect <code>               on a pupil's device: tries it, and says what worked
//!
//! Nothing is sent anywhere but between the two devices, and nothing is kept.

use std::net::Ipv4Addr;
use std::process::ExitCode;

use relay_probe::{answer_broadcasts, listen, local_ip, probe, serve, ClassCode, Report};

fn yes(value: bool) -> &'static str {
    if value {
        "yes"
    } else {
        "NO"
    }
}

fn ms(value: Option<f64>) -> String {
    value.map_or_else(|| "-".to_string(), |v| format!("{v:.1} ms"))
}

fn print(report: &Report) {
    println!();
    match report.broadcast_answered {
        Some(answered) => println!("Found the teacher's device without the code (broadcast): {}", yes(answered)),
        None => println!("Found the teacher's device without the code (broadcast): couldn't ask"),
    }
    println!("Reached the teacher's device with the code:           {}", yes(report.connected));
    if report.connected {
        println!("  time to connect:                                     {}", ms(report.connect_ms));
        println!("Teacher's device accepted this one's proof:           {}", yes(report.pupil_accepted));
        println!("This one accepted the teacher's device's proof:       {}", yes(report.teacher_proved));
    }
    if report.echo_median_ms.is_some() {
        println!("Round trip, typical / worst of 20:                    {} / {}", ms(report.echo_median_ms), ms(report.echo_max_ms));
        println!("Longest wait between reply events (sent every 20 ms): {}", ms(report.events_worst_gap_ms));
        println!(
            "Speed for 1 MB:                                       {}",
            report.bulk_mbit_per_s.map_or_else(|| "-".to_string(), |v| format!("{v:.1} Mbit/s"))
        );
    }
    if let Some(error) = &report.error {
        println!("What went wrong: {error}");
    }
    println!();
    let good = report.connected && report.pupil_accepted && report.teacher_proved && report.error.is_none();
    if good {
        println!("RESULT: a classroom relay could work on this network, between these two devices.");
    } else if !report.connected {
        println!("RESULT: this device can't reach the teacher's. The network may keep devices apart (client isolation), or a firewall on the teacher's device is blocking it.");
    } else {
        println!("RESULT: reached the teacher's device, but the test didn't finish. Check the code, and try again.");
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("listen") => {
            let ip = match args.iter().position(|a| a == "--ip") {
                Some(at) => match args.get(at + 1).and_then(|text| text.parse::<Ipv4Addr>().ok()) {
                    Some(ip) => ip,
                    None => {
                        eprintln!("--ip needs an address, such as 192.168.1.20");
                        return ExitCode::from(2);
                    }
                },
                None => match local_ip() {
                    Some(ip) => ip,
                    None => {
                        eprintln!("Couldn't tell this device's address. Run it again with --ip and the address from the network settings.");
                        return ExitCode::from(2);
                    }
                },
            };
            let (code, listener) = match listen(ip) {
                Ok(started) => started,
                Err(error) => {
                    eprintln!("Couldn't start listening: {error}");
                    return ExitCode::FAILURE;
                }
            };
            std::thread::spawn(|| {
                if let Err(error) = answer_broadcasts() {
                    eprintln!("(Not answering broadcasts: {error})");
                }
            });
            println!("Teacher's device: {ip}, port {}", code.port);
            println!();
            println!("    Class code:  {}", code.encode());
            println!();
            println!("On each pupil's device, run:  relay-probe connect {}", code.encode());
            println!("If the system asks whether to allow connections, allow them on private networks.");
            println!("Leave this running. Each pupil's device is reported below. Ctrl+C to stop.");
            let secret = code.secret;
            for (number, incoming) in listener.incoming().enumerate() {
                match incoming {
                    Ok(stream) => {
                        let from = stream.peer_addr().map(|a| a.to_string()).unwrap_or_default();
                        std::thread::spawn(move || match serve(stream, &secret) {
                            Ok(true) => println!("{}. {from}: proved the code, and finished the test", number + 1),
                            Ok(false) => println!("{}. {from}: had the wrong code, and was turned away", number + 1),
                            Err(error) => println!("{}. {from}: stopped part-way ({error})", number + 1),
                        });
                    }
                    Err(error) => println!("A connection failed: {error}"),
                }
            }
            ExitCode::SUCCESS
        }
        Some("connect") => {
            let text = args[1..].join("");
            let Some(code) = ClassCode::decode(&text) else {
                eprintln!("That isn't a class code. It's 20 letters and digits, such as 1A2B-3C4D-5E6F-7G8H-9J0K.");
                return ExitCode::from(2);
            };
            println!("Trying the teacher's device at {}, port {} ...", code.ip, code.port);
            let report = probe(&code, true);
            print(&report);
            if report.connected && report.teacher_proved && report.error.is_none() {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            }
        }
        _ => {
            eprintln!("relay-probe listen [--ip <address>]   on the teacher's device");
            eprintln!("relay-probe connect <class code>      on a pupil's device");
            ExitCode::from(2)
        }
    }
}
