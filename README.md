# Web Vitals Chrome Extension

[Web Vitals](https://web.dev/metrics) is an effort to measure the quality and performance of user-experiences on the web. 

To assist developers in their iteration workflows towards hitting the Core Web Vitals metric thresholds, this Chrome extension visualizes the metric values (LCP, FID, CLS) and whether they fall into good/adequate/poor buckets.

## Use cases

* I'm a developer browsing the web. I would like to quickly check how well a URL performs on the Core Web Vitals. 
* I'm a developer actively building a page. I would like to see how metrics improve as I make local changes. 

## Installation

Download the extension and manually load it as an 'Unpacked extension' via the extensions page:

1. Clone this repository locally
2. Navigate to [chrome://extensions/](chrome://extensions/)
3. Click "Load unpacked" and select the `extension` directory

## Usage

Once installed, the extension will display a disabled state badge icon until you navigate to a URL. At this point it will update the badge to green or red depending on whether the URL passes the Core Web Vitals metrics thresholds. Clicking the badge icon will allow you to drill in to the individual metric values.

## How does it work?

* `src/browser_action/vitals.js`: Script that leverages WebVitals.js to collect metrics and broadcast metric changes for badging and the HUD. Provides an overall score of the metrics that can be used for badging.
* `src/bg/background.js`: Performs badge icon updates using data provided by vitals.js. Passes along
data to `popup.js` in order to display the more detailed local metrics summary.
* `src/browser_action/popup.js`: Content Script that handles rendering detailed metrics reports in the pop-up window displayed when clicking the badge icon.
* `src/options/options.js`: Options UI (saved configuration) for advanced features like the HUD Overlay

## License

[Apache 2.0](/LICENSE)