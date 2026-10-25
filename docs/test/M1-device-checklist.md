# M1 device runs: checklist

The steps around the device runs: getting the devices ready, the order to run the spikes in, what to send back, and what happens next. The steps for each spike are in [M1-spikes.md](M1-spikes.md); this checklist doesn't repeat them. **Who:** the owner, with S1 writing up. Record no personal data.

## 1. Before the devices arrive

| # | Do | ✓ |
|---|---|---|
| 1 | **Choose the reference iPad** (#6): a current non-Pro iPad, ideally the base model schools buy most. Safari 26 is needed for spike 1.8, so it must run iPadOS 26. Note its model and storage size. | |
| 2 | **Decide the Android tablet for spike 1.9 (AR).** Workplan 1.9 and 21.6 ask for an Android tablet with ARCore, as well as the Chromebook and the iPad. The M1 runs of 1.2–1.8 don't need it. Either choose one, or ask S1 to propose trying AR on the Chromebook instead (a plan change). | |
| 3 | Comment on #6 with the Chromebook (Acer Chromebook Spin 314, N100, 4 GB) and the iPad: model, and whether school-managed Chromebooks allow Android apps, if you know. S1 records them in `docs/spikes/devices.md`. | |
| 4 | Use the devices as **your own**, signed in with a personal account, not enrolled in a school's management. Spike 1.7 needs developer settings that school management usually blocks. | |

## 2. When they arrive (about 30 minutes each)

| # | Do | ✓ |
|---|---|---|
| 1 | Install every system update, then restart. Note the OS version: ChromeOS (Settings → About ChromeOS) and iPadOS (Settings → General → About). | |
| 2 | Note the browser version: Chrome (`chrome://version`) and Safari (it matches iPadOS). | |
| 3 | Charge fully, and keep the device plugged in for every run. | |
| 4 | Connect to Wi-Fi. Spike 1.3 downloads about 110 MB of speech models on its first run. | |
| 5 | Open **https://storystage.github.io/storystage2/** and check the index loads. Note the build it shows. | |

## 3. The runs, in this order

Browser spikes first, then spike 1.7 last on the Chromebook, because turning its developer settings off again erases the Chromebook. The times are rough and include reading the results.

| Order | Device | Spike (steps in M1-spikes.md) | About | ✓ |
|---|---|---|---|---|
| 1 | Chromebook, Chrome | **1.4** interpreter and scheduler | 5 min | |
| 2 | Chromebook, Chrome | **1.5** both code editors, by touch and keyboard | 15 min | |
| 3 | Chromebook, Chrome | **1.2** characters, budget sweep | 10 min | |
| 4 | Chromebook, Chrome | **1.8** MP4 export, including the **AAC** answer | 10 min | |
| 5 | Chromebook, Chrome | **1.3** speech to text, including airplane mode | 20 min | |
| 6 | iPad, Safari | **1.4**, **1.5** (touch), **1.2**, **1.8**, **1.3**, in that order | 1 hour | |
| 7 | Chromebook | **1.7** the Android app: developer settings, install, run | 45 min | |

Before each spike: close other apps and tabs, note the battery level and whether the device is warm, and keep the page in view until its results appear. If a page crashes or reloads by itself, note it: that is a result, especially for 1.3 (memory) on the Chromebook.

## 4. Send the results

The quickest way: **paste each page's results into a chat with S1**, with the device, OS and browser versions and your notes. S1 writes them into `docs/test/results/M1-<date>.md`. Or fill this in yourself:

```
# M1 device runs, <date>

## Devices
- Chromebook: Acer Chromebook Spin 314 (N100, 4 GB), ChromeOS ___, Chrome ___
- iPad: ___ (___ GB), iPadOS ___, Safari ___
- Battery and warmth before each spike: ___

## 1.4  Chromebook: ___  iPad: ___
## 1.5  Chromebook: ___  iPad: ___  Which felt easier by touch, and why: ___
## 1.2  Chromebook: ___  iPad: ___  Where motion starts to feel jerky: ___
## 1.8  Chromebook (probe.aac = ___): ___  iPad: ___
## 1.3  Chromebook: ___  iPad: ___  Airplane mode worked: ___
## 1.7  Android WebView version: ___  Results: ___  Install steps that differed: ___
## Anything that crashed, reloaded or looked wrong
___
```

## 5. What happens next

S1 does these from your results. The decisions are yours.

| Spike | The device run answers | Then |
|---|---|---|
| **1.2** | The largest preset that holds **30 fps on the Chromebook at "low"** (WP5's done-when) | S1 proposes go and the budgets per model and per scene. You record go or no-go. The budgets go to S4 (WP3.9) and S3 (WP5a), replacing the working assumption of about 20k triangles per character and 100k per scene. |
| **1.3** | Whether whisper fits in 4 GB without the tab crashing, and how long a 5-second request takes | S1 proposes go, or a plan change such as a smaller starting memory or the quantised model only (WP14.1). |
| **1.4** | Timing on the devices | Already go (21 Oct). Recorded as confirmed, or reopened if `lateCommands` isn't 0. |
| **1.5** | Touch on both editors, and Blockly's stutter as a drag starts | Already go for both (21 Oct). Your touch impressions and the stutter numbers go to WP7 (S5) and WP7c (S6). |
| **1.7** | Whether the Android app runs well enough on the Chromebook, and the real WebView version | S1 proposes go or no-go. Whether schools allow installing it comes from the classroom questions (1.11, #16). |
| **1.8** | **Does the Chromebook encode AAC?** | Yes: AAC everywhere. No: you choose the audio fallback (the options are in the spike report). Either way, S2 builds WP11b on it. |

Then S1:

- fills in the M1 rows of `docs/spikes/REPORT.md`, and the go or no-go record for each spike in `docs/decisions/`, once you've decided;
- writes `docs/spikes/devices.md` and closes #6 (WP1.1);
- records the actual dates for WP1.1 and WP1 in `tools/plan/schedule.yaml`, and says what moved;
- starts building spike 1.9 (AR), once the Android tablet question (section 1, row 2) is settled.

WP1 is done when you've read the report and recorded go or no-go for each spike.
