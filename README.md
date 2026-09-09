# API Checkpoint

A lightweight, browser-based GUI for manually exercising APIs and turning those requests into repeatable checks. It stores requests and run history in the browser, so there is no backend or account to configure.

## Use it

Open `index.html` in a modern browser, or serve the folder with any static web server. Add a URL, optional headers/body, and assertions, then choose **Run test**. The sample request uses JSONPlaceholder.

### Checks

- **Status equals** — checks the HTTP status code.
- **Response contains** — checks plain response text.
- **JSON path equals** — use `path=value`, such as `0.name=Leanne Graham`.
- **Response time under** — checks milliseconds elapsed in the browser.

## Reporting

Every run is kept locally and can be downloaded as JSON, CSV, or a self-contained HTML report. The browser's same-origin rules apply: target APIs need to permit CORS for direct requests from this tool.
