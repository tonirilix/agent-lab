import { spawn, type ChildProcess } from "node:child_process";

const rawArguments = process.argv.slice(2);
const forwardedArguments =
  rawArguments[0] === "--" ? rawArguments.slice(1) : rawArguments;
const children: ChildProcess[] = [];
let stopping = false;

function start(script: string, arguments_: string[] = []) {
  const child = spawn("pnpm", [script, ...arguments_], {
    stdio: "inherit",
    shell: false,
  });
  children.push(child);
  child.on("exit", (code) => {
    if (!stopping) {
      stopping = true;
      children.forEach((runningChild) => {
        if (runningChild !== child) {
          runningChild.kill("SIGTERM");
        }
      });
      process.exitCode = code ?? 1;
    }
  });
}

function stop() {
  stopping = true;
  children.forEach((child) => child.kill("SIGTERM"));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

start("dev:server", forwardedArguments.length ? ["--", ...forwardedArguments] : []);
start("dev:client");
