import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import process from "node:process";

const executable = resolve(
  "src-tauri/target/release",
  process.platform === "win32" ? "mermagram.exe" : "mermagram",
);
const command = process.platform === "linux" ? "xvfb-run" : executable;
const args = process.platform === "linux" ? ["-a", executable] : [];
const app = spawn(command, args, { stdio: "inherit", windowsHide: true });

let exit;
app.once("error", (error) => {
  console.error(`Could not launch desktop app: ${error.message}`);
  process.exitCode = 1;
});
app.once("exit", (code, signal) => {
  exit = { code, signal };
});

await delay(5000);
if (exit) {
  console.error(`Desktop app exited during startup (code=${exit.code}, signal=${exit.signal}).`);
  process.exitCode = 1;
} else {
  console.log("Desktop app stayed running for the 5-second startup smoke window.");
}

if (process.platform === "win32") {
  spawn("taskkill", ["/pid", String(app.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
} else {
  app.kill("SIGTERM");
}
