import { environment, getPreferenceValues, LocalStorage } from "@raycast/api";
import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

interface Preferences {
  rpcPort: string;
  rpcSecret?: string;
  autoStartDaemon: boolean;
  checkCertificate?: boolean;
}

/**
 * Checks if aria2c is running and responding to JSON-RPC on the given port.
 * Validates that the response format is indeed a JSON-RPC response from aria2c.
 */
export async function isAria2Running(
  port: number,
  secret?: string,
): Promise<boolean> {
  try {
    const params = secret ? [`token:${secret}`] : [];
    const res = await fetch(`http://127.0.0.1:${port}/jsonrpc`, {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "ping",
        method: "aria2.getVersion",
        params,
      }),
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(500),
    });
    const text = await res.text();
    const json = JSON.parse(text);
    return (
      json &&
      json.jsonrpc === "2.0" &&
      json.id === "ping" &&
      (json.result !== undefined ||
        (json.error !== undefined && typeof json.error.message === "string"))
    );
  } catch {
    return false;
  }
}

/**
 * Resolves the path to a usable aria2c binary.
 * First checks the bundled extension assets, then falls back to system paths.
 */
export function resolveAria2cBinary(): string {
  const arch = process.arch; // "arm64" or "x64"
  const bundledName = arch === "arm64" ? "aria2c-arm64" : "aria2c-x64";
  const bundledPath = path.join(environment.assetsPath, "bin", bundledName);

  // Check if bundled binary exists
  if (fs.existsSync(bundledPath)) {
    try {
      // Ensure it is executable
      fs.accessSync(bundledPath, fs.constants.X_OK);
    } catch {
      try {
        fs.chmodSync(bundledPath, 0o755);
      } catch (e) {
        console.error("Failed to make bundled binary executable:", e);
      }
    }
    return bundledPath;
  }

  // Fallbacks: Check standard Homebrew paths and system PATH
  const homebrewArmPath = "/opt/homebrew/bin/aria2c";
  const homebrewIntelPath = "/usr/local/bin/aria2c";

  if (fs.existsSync(homebrewArmPath)) {
    return homebrewArmPath;
  }
  if (fs.existsSync(homebrewIntelPath)) {
    return homebrewIntelPath;
  }

  // Fallback to searching PATH
  return "aria2c";
}

/**
 * Checks if the running daemon's configuration matches the current user preferences.
 */
async function checkDaemonConfigMatches(
  port: number,
  preferences: Preferences,
): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let customConfig: any = {};
    try {
      const stored = await LocalStorage.getItem<string>("aria2_custom_config");
      if (stored) {
        customConfig = JSON.parse(stored);
      }
    } catch (e) {
      // Ignore
    }

    const secret = preferences.rpcSecret;
    const params = secret ? [`token:${secret}`] : [];
    const response = await fetch(`http://127.0.0.1:${port}/jsonrpc`, {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "check-config",
        method: "aria2.getGlobalOption",
        params,
      }),
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(1000),
    });

    if (!response.ok) {
      return false;
    }

    const json = (await response.json()) as {
      result?: Record<string, string>;
      error?: { code?: number };
    };

    if (json.error) {
      return false;
    }

    const options = json.result;
    if (!options) {
      return false;
    }

    // 1. Verify check-certificate matches
    const expectedCheckCert =
      preferences.checkCertificate === true ? "true" : "false";
    if (options["check-certificate"] !== expectedCheckCert) {
      return false;
    }

    // 2. Verify download directory matches
    const downloadDir = customConfig.downloadDir || "~/Downloads";
    const expandedExpectedDir = path.resolve(
      downloadDir.replace(/^~/, os.homedir()),
    );
    const expandedActualDir = path.resolve(
      options["dir"].replace(/^~/, os.homedir()),
    );
    if (expandedExpectedDir !== expandedActualDir) {
      return false;
    }

    // 3. Verify Download Limit matches
    const expectedDownLimit =
      customConfig.downloadLimit && customConfig.downloadLimit !== "0"
        ? `${customConfig.downloadLimit}${customConfig.downloadLimitUnit === "MB" ? "M" : "K"}`
        : "0";
    if ((options["max-overall-download-limit"] || "0") !== expectedDownLimit) {
      return false;
    }

    // 4. Verify Upload Limit matches
    const expectedUpLimit =
      customConfig.uploadLimit && customConfig.uploadLimit !== "0"
        ? `${customConfig.uploadLimit}${customConfig.uploadLimitUnit === "MB" ? "M" : "K"}`
        : "0";
    if ((options["max-overall-upload-limit"] || "0") !== expectedUpLimit) {
      return false;
    }

    // 5. Verify Max Active Tasks matches
    const expectedMaxActive = customConfig.maxActiveTasks || "5";
    if ((options["max-concurrent-downloads"] || "5") !== expectedMaxActive) {
      return false;
    }

    // 6. Verify User-Agent matches
    if (
      customConfig.userAgent &&
      options["user-agent"] !== customConfig.userAgent
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Cleanly shuts down the running daemon via JSON-RPC.
 */
async function shutdownDaemon(port: number, secret?: string): Promise<boolean> {
  try {
    const params = secret ? [`token:${secret}`] : [];
    const response = await fetch(`http://127.0.0.1:${port}/jsonrpc`, {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "shutdown",
        method: "aria2.forceShutdown",
        params,
      }),
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Forcefully kills any process listening on the specified port.
 */
function killPortProcess(port: number): void {
  try {
    const pidStr = execSync(`lsof -t -sTCP:LISTEN -i:${port}`, {
      encoding: "utf8",
    }).trim();
    if (pidStr) {
      const pids = pidStr.split(/\s+/);
      for (const pid of pids) {
        if (pid) {
          process.kill(parseInt(pid, 10), "SIGKILL");
        }
      }
    }
  } catch (e) {
    // Ignore error if process not found or kill fails
  }
}

/**
 * Starts the local aria2c daemon in the background if it's not already running.
 */
export async function startAria2Daemon(): Promise<void> {
  const preferences = getPreferenceValues<Preferences>();
  const port = parseInt(preferences.rpcPort || "6800", 10);

  if (!preferences.autoStartDaemon) {
    return;
  }

  // Load custom configuration from LocalStorage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let customConfig: any = {};
  try {
    const stored = await LocalStorage.getItem<string>("aria2_custom_config");
    if (stored) {
      customConfig = JSON.parse(stored);
    }
  } catch (e) {
    console.error("Failed to load custom config:", e);
  }

  // If already running, check configuration. If mismatch, shutdown and restart.
  if (await isAria2Running(port, preferences.rpcSecret)) {
    const matches = await checkDaemonConfigMatches(port, preferences);
    if (matches) {
      return;
    }

    console.log(
      `Aria2 daemon config mismatch. Restarting daemon on port ${port}...`,
    );
    await shutdownDaemon(port, preferences.rpcSecret);
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (await isAria2Running(port, preferences.rpcSecret)) {
      killPortProcess(port);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  const binaryPath = resolveAria2cBinary();

  // Setup session file to persist download tasks across daemon restarts
  if (!fs.existsSync(environment.supportPath)) {
    try {
      fs.mkdirSync(environment.supportPath, { recursive: true });
    } catch (e) {
      console.error("Failed to create support directory:", e);
    }
  }
  const sessionPath = path.join(environment.supportPath, "aria2.session");
  if (!fs.existsSync(sessionPath)) {
    try {
      fs.writeFileSync(sessionPath, "");
    } catch (e) {
      console.error("Failed to initialize session file:", e);
    }
  }

  const args = [
    "--enable-rpc=true",
    "--rpc-listen-all=false",
    `--rpc-listen-port=${port}`,
    "--daemon=true",
    `--input-file=${sessionPath}`,
    `--save-session=${sessionPath}`,
    "--save-session-interval=10",
  ];

  // Provide system CA certificate bundle to resolve macOS SSL/TLS handshake errors
  const caCertPath = "/etc/ssl/cert.pem";
  if (fs.existsSync(caCertPath)) {
    args.push(`--ca-certificate=${caCertPath}`);
  }

  if (preferences.checkCertificate === true) {
    args.push("--check-certificate=true");
  } else {
    args.push("--check-certificate=false");
  }

  let tempConfPath = "";
  if (preferences.rpcSecret) {
    try {
      const rand = Math.random().toString(36).substring(2, 15);
      tempConfPath = path.join(environment.supportPath, `aria2-${rand}.conf`);
      fs.writeFileSync(tempConfPath, `rpc-secret=${preferences.rpcSecret}\n`, {
        mode: 0o600,
      });
      args.push(`--conf-path=${tempConfPath}`);
    } catch (e) {
      console.error("Failed to create temporary config file:", e);
    }
  }

  // Download Directory
  const downloadDir = customConfig.downloadDir || "~/Downloads";
  const expandedDir = downloadDir.replace(/^~/, os.homedir());
  if (!fs.existsSync(expandedDir)) {
    try {
      fs.mkdirSync(expandedDir, { recursive: true });
    } catch (e) {
      console.error("Failed to create download directory:", e);
    }
  }
  args.push(`--dir=${expandedDir}`);

  // Transmission bandwidth limits
  if (customConfig.downloadLimit && customConfig.downloadLimit !== "0") {
    const unit = customConfig.downloadLimitUnit === "MB" ? "M" : "K";
    args.push(
      `--max-overall-download-limit=${customConfig.downloadLimit}${unit}`,
    );
  }
  if (customConfig.uploadLimit && customConfig.uploadLimit !== "0") {
    const unit = customConfig.uploadLimitUnit === "MB" ? "M" : "K";
    args.push(`--max-overall-upload-limit=${customConfig.uploadLimit}${unit}`);
  }

  // BitTorrent Settings
  if (customConfig.saveMagnetAsTorrent !== undefined) {
    args.push(`--bt-save-metadata=${customConfig.saveMagnetAsTorrent}`);
  }
  if (customConfig.autoDownloadMagnetTorrent !== undefined) {
    args.push(`--follow-torrent=${customConfig.autoDownloadMagnetTorrent}`);
    args.push(`--follow-metalink=${customConfig.autoDownloadMagnetTorrent}`);
  }
  if (customConfig.btForceEncryption !== undefined) {
    args.push(`--bt-require-crypto=${customConfig.btForceEncryption}`);
  }
  if (customConfig.keepSeeding === true) {
    args.push("--seed-time=0");
  } else {
    if (customConfig.seedTime) {
      args.push(`--seed-time=${customConfig.seedTime}`);
    }
    if (customConfig.seedRatio) {
      args.push(`--seed-ratio=${customConfig.seedRatio}`);
    }
  }

  // Task Management
  if (customConfig.maxActiveTasks) {
    args.push(`--max-concurrent-downloads=${customConfig.maxActiveTasks}`);
  }
  if (customConfig.maxConnectionsPerServer) {
    const maxConn = parseInt(customConfig.maxConnectionsPerServer, 10);
    args.push(`--max-connection-per-server=${Math.min(16, maxConn)}`);
  }
  if (customConfig.continueDownload !== false) {
    args.push("--continue=true");
  }

  // User-Agent
  if (customConfig.userAgent) {
    args.push(`--user-agent=${customConfig.userAgent}`);
  }

  try {
    const child = spawn(binaryPath, args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    // Poll the RPC port up to 10 times (every 200ms) to allow the daemon time to start
    let isRunning = false;
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (await isAria2Running(port, preferences.rpcSecret)) {
        isRunning = true;
        break;
      }
    }

    if (!isRunning) {
      throw new Error("aria2c started but is not responding on the RPC port.");
    }
  } catch (error) {
    console.error("Failed to start aria2c daemon:", error);
    throw error;
  } finally {
    if (tempConfPath) {
      try {
        if (fs.existsSync(tempConfPath)) {
          fs.unlinkSync(tempConfPath);
        }
      } catch (e) {
        console.error("Failed to delete temporary config file:", e);
      }
    }
  }
}
