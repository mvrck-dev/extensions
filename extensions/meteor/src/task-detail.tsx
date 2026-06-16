import {
  Detail,
  ActionPanel,
  Action,
  showToast,
  Toast,
  Icon,
  Color,
} from "@raycast/api";
import { useEffect, useState } from "react";
import {
  tellStatus,
  pauseTask,
  resumeTask,
  formatBytes,
  formatSpeed,
  formatEta,
  getTaskName,
  Aria2Task,
} from "./utils/aria2rpc";

interface DetailTaskProps {
  gid: string;
}

export default function DetailTask({ gid }: DetailTaskProps) {
  const [task, setTask] = useState<Aria2Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const poll = async () => {
      try {
        const updatedTask = await tellStatus(gid);
        if (isMounted) {
          setTask(updatedTask);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        console.error("Failed to fetch task details:", err);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    poll();
    const timer = setInterval(poll, 1000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [gid]);

  const handlePause = async () => {
    if (!task) return;
    try {
      await pauseTask(task.gid);
      await showToast({ style: Toast.Style.Success, title: "Task Paused" });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to pause task",
        message: errMsg,
      });
    }
  };

  const handleResume = async () => {
    if (!task) return;
    try {
      await resumeTask(task.gid);
      await showToast({ style: Toast.Style.Success, title: "Task Resumed" });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to resume task",
        message: errMsg,
      });
    }
  };

  // Helper to parse the hex pieces bitfield and generate a dynamic, realistic SVG grid matching aria2c pieces
  const renderBlockMap = (
    piecesHex?: string,
    numPiecesStr?: string,
    completedLength?: string,
    totalLength?: string,
  ): string => {
    const numPieces = numPiecesStr ? parseInt(numPiecesStr, 10) : 0;
    const hasBitfield = piecesHex && numPieces > 0;

    let totalBlocks = 100;
    let isGrouped = false;
    let blockRatios: number[] = [];

    if (hasBitfield) {
      // Convert hex string to binary bitfield array (0s and 1s)
      const bitfield: number[] = [];
      for (let i = 0; i < piecesHex.length; i++) {
        const val = parseInt(piecesHex[i], 16);
        if (isNaN(val)) continue;
        for (let bit = 3; bit >= 0; bit--) {
          if (bitfield.length < numPieces) {
            bitfield.push((val >> bit) & 1);
          }
        }
      }

      // Limit maximum visual blocks to prevent rendering overhead with huge files (max 800 blocks)
      const MAX_VISUAL_BLOCKS = 800;
      isGrouped = numPieces > MAX_VISUAL_BLOCKS;
      totalBlocks = isGrouped ? MAX_VISUAL_BLOCKS : numPieces;

      blockRatios = new Array(totalBlocks).fill(0);
      if (isGrouped) {
        const blockSize = numPieces / totalBlocks;
        for (let b = 0; b < totalBlocks; b++) {
          const start = Math.floor(b * blockSize);
          const end = Math.min(numPieces, Math.floor((b + 1) * blockSize));

          let completedCount = 0;
          const len = end - start;
          if (len > 0) {
            for (let p = start; p < end; p++) {
              if (bitfield[p] === 1) completedCount++;
            }
            blockRatios[b] = completedCount / len;
          }
        }
      } else {
        for (let i = 0; i < numPieces; i++) {
          blockRatios.push(bitfield[i]);
        }
      }
    } else {
      // Fallback: Generate progressive segment block map based on overall ratio for HTTP/HTTPS streams
      totalBlocks = 100; // 5 rows of 20 cols
      blockRatios = new Array(totalBlocks).fill(0);

      const completedBytes = completedLength
        ? parseInt(completedLength, 10)
        : 0;
      const totalBytes = totalLength ? parseInt(totalLength, 10) : 0;
      const progressRatio = totalBytes > 0 ? completedBytes / totalBytes : 0;

      const completedBlocksCount = progressRatio * totalBlocks;
      for (let b = 0; b < totalBlocks; b++) {
        if (b < Math.floor(completedBlocksCount)) {
          blockRatios[b] = 1.0;
        } else if (b === Math.floor(completedBlocksCount)) {
          blockRatios[b] =
            completedBlocksCount - Math.floor(completedBlocksCount);
        } else {
          blockRatios[b] = 0.0;
        }
      }
    }

    // Dynamically calculate grid columns and rows to keep it neat
    const cols = totalBlocks < 20 ? totalBlocks : 20;
    const rows = Math.ceil(totalBlocks / cols);

    const blockWidth = 14;
    const blockHeight = 14;
    const gap = 3;

    const width = cols * (blockWidth + gap) - gap;
    const height = rows * (blockHeight + gap) - gap;

    const fill = "#2ea44f"; // GitHub Green
    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const b = r * cols + c;
        if (b >= totalBlocks) break;

        const ratio = blockRatios[b];
        const x = c * (blockWidth + gap);
        const y = r * (blockHeight + gap);

        let opacity = 0.08; // Empty background block shade
        if (ratio >= 0.99) {
          opacity = 1.0;
        } else if (ratio >= 0.7) {
          opacity = 0.7;
        } else if (ratio >= 0.3) {
          opacity = 0.45;
        } else if (ratio > 0) {
          opacity = 0.2;
        }

        svg += `<rect x="${x}" y="${y}" width="${blockWidth}" height="${blockHeight}" rx="2" fill="${fill}" opacity="${opacity}" />`;
      }
    }

    svg += "</svg>";
    const base64 = Buffer.from(svg).toString("base64");
    const svgUri = `data:image/svg+xml;base64,${base64}`;

    return `\n![Pieces Map](${svgUri})\n`;
  };

  const generateProgressBar = (percentNum: number): string => {
    const totalChars = 20;
    const filledChars = Math.round((percentNum / 100) * totalChars);
    const emptyChars = totalChars - filledChars;
    return `\`${"█".repeat(filledChars)}${"░".repeat(emptyChars)}\`  **${percentNum.toFixed(2)}%**`;
  };

  if (!task) {
    return (
      <Detail isLoading={isLoading} markdown="### Loading task details..." />
    );
  }

  const name = getTaskName(task);
  const total = parseInt(task.totalLength, 10) || 0;
  const completed = parseInt(task.completedLength, 10) || 0;
  const percentNum = total > 0 ? (completed / total) * 100 : 0;
  const percent = percentNum.toFixed(2);
  const eta = formatEta(
    task.totalLength,
    task.completedLength,
    task.downloadSpeed,
  );
  const firstFile = task.files?.[0];
  const filePath = firstFile?.path || "Not allocated yet";

  const blockMap = renderBlockMap(
    task.pieces,
    task.numPieces,
    task.completedLength,
    task.totalLength,
  );
  const progressBar = generateProgressBar(percentNum);

  // Status mapping
  let statusColor = Color.Blue;
  if (task.status === "active") {
    statusColor = Color.Green;
  } else if (task.status === "paused") {
    statusColor = Color.Yellow;
  } else if (task.status === "waiting") {
    statusColor = Color.Purple;
  } else if (task.status === "error") {
    statusColor = Color.Red;
  } else if (task.status === "complete") {
    statusColor = Color.Blue;
  }

  const statusText = task.status.charAt(0).toUpperCase() + task.status.slice(1);

  const markdown = `
# ${name}

${task.status === "active" ? `### Downloading - **${formatSpeed(task.downloadSpeed)}**` : ""}
${task.status === "paused" ? "### Paused" : ""}
${task.status === "complete" ? "### Completed" : ""}
${task.status === "error" ? `### Error: ${task.errorMessage || `Error Code: ${task.errorCode}`}` : ""}
${task.status === "waiting" ? "### Waiting in Queue" : ""}

${progressBar}

---

### Download Chunks Map
${blockMap}
`;

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      navigationTitle={name}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="File Name" text={name} />
          {firstFile && firstFile.path && (
            <Detail.Metadata.Label title="Save Location" text={filePath} />
          )}
          <Detail.Metadata.Separator />

          <Detail.Metadata.TagList title="Status">
            <Detail.Metadata.TagList.Item
              text={statusText}
              color={statusColor}
            />
          </Detail.Metadata.TagList>

          <Detail.Metadata.Label
            title="Size"
            text={formatBytes(task.totalLength)}
          />
          <Detail.Metadata.Label
            title="Downloaded"
            text={`${formatBytes(task.completedLength)} (${percent}%)`}
          />

          {task.status === "active" && (
            <>
              <Detail.Metadata.Label
                title="Download Speed"
                text={formatSpeed(task.downloadSpeed)}
              />
              <Detail.Metadata.Label
                title="Upload Speed"
                text={formatSpeed(task.uploadSpeed)}
              />
              <Detail.Metadata.Label title="ETA" text={eta} />
            </>
          )}

          <Detail.Metadata.Label title="Connections" text={task.connections} />

          {task.errorCode && (
            <Detail.Metadata.Label title="Error Code" text={task.errorCode} />
          )}
          {task.errorMessage && (
            <Detail.Metadata.Label
              title="Error Message"
              text={task.errorMessage}
            />
          )}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          {task.status === "active" && (
            <Action
              title="Pause Download"
              icon={Icon.Pause}
              onAction={handlePause}
            />
          )}
          {(task.status === "paused" || task.status === "waiting") && (
            <Action
              title="Resume Download"
              icon={Icon.Play}
              onAction={handleResume}
            />
          )}
          {firstFile && firstFile.path && (
            <Action.ShowInFinder
              title="Reveal in Finder"
              path={firstFile.path}
            />
          )}
        </ActionPanel>
      }
    />
  );
}
