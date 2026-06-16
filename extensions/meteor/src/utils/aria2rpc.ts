import { getPreferenceValues } from "@raycast/api";
import path from "path";

interface Preferences {
  rpcPort: string;
  rpcSecret?: string;
}

export interface Aria2File {
  index: string;
  path: string;
  length: string;
  completedLength: string;
  selected: string;
  uris: Array<{ status: string; uri: string }>;
}

export interface Aria2Task {
  gid: string;
  status: "active" | "waiting" | "paused" | "error" | "complete" | "removed";
  totalLength: string;
  completedLength: string;
  uploadLength: string;
  downloadSpeed: string;
  uploadSpeed: string;
  infoHash?: string;
  numSeeders?: string;
  connections: string;
  errorCode?: string;
  errorMessage?: string;
  pieces?: string;
  numPieces?: string;
  files: Aria2File[];
  bittorrent?: {
    info?: {
      name?: string;
    };
  };
}

export interface GlobalStat {
  downloadSpeed: string;
  uploadSpeed: string;
  numActive: string;
  numWaiting: string;
  numStopped: string;
}

/**
 * Perform a raw JSON-RPC call to aria2
 */
async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  const preferences = getPreferenceValues<Preferences>();
  const port = preferences.rpcPort || "6800";
  const secret = preferences.rpcSecret;

  const url = `http://127.0.0.1:${port}/jsonrpc`;
  const formattedParams = secret ? [`token:${secret}`, ...params] : params;

  const body = {
    jsonrpc: "2.0",
    id: `raycast-${Date.now()}`,
    method,
    params: formattedParams,
  };

  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        "Unauthorized: Invalid RPC Secret Token. Check extension preferences.",
      );
    }
    throw new Error(`HTTP Error ${response.status} connecting to aria2c`);
  }

  const json = (await response.json()) as {
    result?: T;
    error?: { message?: string; code?: number };
  };
  if (json.error) {
    throw new Error(json.error.message || `RPC Error ${json.error.code}`);
  }

  return json.result as T;
}

// --- Aria2 Public RPC Methods ---

export async function addUri(
  uris: string[],
  options: Record<string, string | string[]> = {},
): Promise<string> {
  return rpcCall<string>("aria2.addUri", [uris, options]);
}

export async function tellActive(): Promise<Aria2Task[]> {
  return rpcCall<Aria2Task[]>("aria2.tellActive");
}

export async function tellWaiting(
  offset = 0,
  num = 1000,
): Promise<Aria2Task[]> {
  return rpcCall<Aria2Task[]>("aria2.tellWaiting", [offset, num]);
}

export async function tellStopped(
  offset = 0,
  num = 1000,
): Promise<Aria2Task[]> {
  return rpcCall<Aria2Task[]>("aria2.tellStopped", [offset, num]);
}

export async function pauseTask(gid: string): Promise<string> {
  return rpcCall<string>("aria2.pause", [gid]);
}

export async function resumeTask(gid: string): Promise<string> {
  return rpcCall<string>("aria2.unpause", [gid]);
}

export async function removeTask(gid: string): Promise<string> {
  return rpcCall<string>("aria2.remove", [gid]);
}

export async function removeTaskResult(gid: string): Promise<string> {
  return rpcCall<string>("aria2.removeDownloadResult", [gid]);
}

export async function addTorrent(
  torrentBase64: string,
  options: Record<string, string | string[]> = {},
): Promise<string> {
  return rpcCall<string>("aria2.addTorrent", [torrentBase64, [], options]);
}

export async function pauseAll(): Promise<string> {
  return rpcCall<string>("aria2.pauseAll");
}

export async function unpauseAll(): Promise<string> {
  return rpcCall<string>("aria2.unpauseAll");
}

export async function purgeDownloadResult(): Promise<string> {
  return rpcCall<string>("aria2.purgeDownloadResult");
}

export async function tellStatus(gid: string): Promise<Aria2Task> {
  return rpcCall<Aria2Task>("aria2.tellStatus", [gid]);
}

export async function getGlobalStat(): Promise<GlobalStat> {
  return rpcCall<GlobalStat>("aria2.getGlobalStat");
}

// --- Formatting Helpers ---

export function formatBytes(bytesStr: string | number): string {
  const bytes =
    typeof bytesStr === "string" ? parseInt(bytesStr, 10) : bytesStr;
  if (isNaN(bytes) || bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function formatSpeed(speedStr: string | number): string {
  const speed =
    typeof speedStr === "string" ? parseInt(speedStr, 10) : speedStr;
  if (isNaN(speed) || speed === 0) return "0 B/s";

  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.floor(Math.log(speed) / Math.log(k));

  return parseFloat((speed / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function formatEta(
  totalLengthStr: string,
  completedLengthStr: string,
  speedStr: string,
): string {
  const total = parseInt(totalLengthStr, 10);
  const completed = parseInt(completedLengthStr, 10);
  const speed = parseInt(speedStr, 10);

  if (isNaN(total) || isNaN(completed) || isNaN(speed) || speed <= 0) {
    return "Unknown";
  }

  const remaining = total - completed;
  if (remaining <= 0) return "Completed";

  const seconds = Math.ceil(remaining / speed);

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function getTaskName(task: Aria2Task): string {
  // 1. BitTorrent name
  if (task.bittorrent?.info?.name) {
    return task.bittorrent.info.name;
  }

  // 2. Extract from files path
  if (task.files && task.files.length > 0) {
    const file = task.files[0];
    if (file.path) {
      return path.basename(file.path);
    }
    // 3. Fallback to URI name if path not allocated
    if (file.uris && file.uris.length > 0) {
      try {
        const urlObj = new URL(file.uris[0].uri);
        const name = path.basename(urlObj.pathname);
        if (name && name !== "/" && name !== "") {
          return decodeURIComponent(name);
        }
      } catch {
        // Not a valid URL, ignore
      }
    }
  }

  return `Download (${task.gid})`;
}
