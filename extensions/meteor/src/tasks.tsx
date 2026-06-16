import {
  List,
  ActionPanel,
  Action,
  showToast,
  Toast,
  Icon,
  Color,
  Alert,
  confirmAlert,
  LocalStorage,
} from "@raycast/api";
import { useEffect, useState, useRef } from "react";
import { startAria2Daemon } from "./utils/daemon";
import fs from "fs";
import {
  tellActive,
  tellWaiting,
  tellStopped,
  pauseTask,
  resumeTask,
  removeTask,
  removeTaskResult,
  pauseAll,
  unpauseAll,
  purgeDownloadResult,
  formatBytes,
  formatSpeed,
  formatEta,
  getTaskName,
  Aria2Task,
} from "./utils/aria2rpc";
import DetailTask from "./task-detail";

export default function Command() {
  const [tasks, setTasks] = useState<Aria2Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [daemonError, setDaemonError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [deleteFileOnRemove, setDeleteFileOnRemove] = useState(false);
  const notifiedCompletedGids = useRef<Set<string>>(new Set());
  const isFirstPoll = useRef(true);
  const notifyOnCompleteRef = useRef(true);

  // Load user config once on mount (and re-load when refreshTrigger changes)
  useEffect(() => {
    async function loadCustomConfig() {
      try {
        const stored = await LocalStorage.getItem<string>(
          "aria2_custom_config",
        );
        if (stored) {
          const parsed = JSON.parse(stored);
          notifyOnCompleteRef.current = parsed.notifyOnComplete !== false;
          setDeleteFileOnRemove(!!parsed.deleteFileOnRemove);
        }
      } catch {
        // keep defaults
      }
    }
    loadCustomConfig();
  }, [refreshTrigger]);

  // Initialize daemon and start polling
  useEffect(() => {
    let isMounted = true;
    let timer: NodeJS.Timeout;

    async function initAndPoll() {
      try {
        await startAria2Daemon();

        const poll = async () => {
          try {
            const [active, waiting, stopped] = await Promise.all([
              tellActive(),
              tellWaiting(),
              tellStopped(),
            ]);

            if (isMounted) {
              const remainingStopped = [...stopped];
              if (isFirstPoll.current) {
                for (const task of stopped) {
                  if (task.status === "complete") {
                    notifiedCompletedGids.current.add(task.gid);
                  }
                }
                isFirstPoll.current = false;
              }

              for (const task of stopped) {
                if (task.status === "complete") {
                  if (!notifiedCompletedGids.current.has(task.gid)) {
                    notifiedCompletedGids.current.add(task.gid);
                    if (notifyOnCompleteRef.current) {
                      showToast({
                        style: Toast.Style.Success,
                        title: "Download Completed",
                        message: getTaskName(task),
                      });
                    }
                  }
                }
              }

              // Merge all tasks into a single flat list preserving sequence
              const combinedTasks = [
                ...active,
                ...waiting,
                ...remainingStopped,
              ];
              setTasks(combinedTasks);
              setDaemonError(null);
              setIsLoading(false);
            }
          } catch (err: unknown) {
            console.error(err);
            if (isMounted) {
              const errMsg = err instanceof Error ? err.message : String(err);
              setDaemonError(errMsg);
              setIsLoading(false);
            }
          }
        };

        await poll();
        // Poll every 1.5 seconds
        timer = setInterval(poll, 1500);
      } catch (err: unknown) {
        console.error(err);
        if (isMounted) {
          const errMsg = err instanceof Error ? err.message : String(err);
          setDaemonError(errMsg);
          setIsLoading(false);
        }
      }
    }

    initAndPoll();

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
    };
  }, [refreshTrigger]);

  // Action Handlers
  const handlePause = async (gid: string) => {
    try {
      await pauseTask(gid);
      await showToast({ style: Toast.Style.Success, title: "Task Paused" });
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to pause task",
        message: errMsg,
      });
    }
  };

  const handleResume = async (gid: string) => {
    try {
      await resumeTask(gid);
      await showToast({ style: Toast.Style.Success, title: "Task Resumed" });
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to resume task",
        message: errMsg,
      });
    }
  };

  const handleRemove = async (task: Aria2Task) => {
    const isStopped =
      task.status === "complete" ||
      task.status === "error" ||
      task.status === "removed";

    const confirmed = await confirmAlert({
      title: deleteFileOnRemove
        ? "Delete Download Task"
        : "Remove Download Task",
      message: deleteFileOnRemove
        ? `Are you sure you want to delete "${getTaskName(task)}"? This will delete the downloaded file from disk.`
        : `Are you sure you want to remove "${getTaskName(task)}"? (This won't delete the downloaded file)`,
      primaryAction: {
        title: deleteFileOnRemove ? "Delete" : "Remove",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (!confirmed) return;

    try {
      if (deleteFileOnRemove && task.files) {
        for (const file of task.files) {
          if (file.path && fs.existsSync(file.path)) {
            try {
              fs.rmSync(file.path, { force: true, recursive: true });
            } catch (err) {
              console.error(`Failed to delete file ${file.path}:`, err);
            }
          }
        }
      }

      if (isStopped) {
        await removeTaskResult(task.gid);
      } else {
        await removeTask(task.gid);
        await removeTaskResult(task.gid).catch(() => {});
      }
      await showToast({
        style: Toast.Style.Success,
        title: deleteFileOnRemove ? "Task and File Deleted" : "Task Removed",
      });
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await showToast({
        style: Toast.Style.Failure,
        title: deleteFileOnRemove
          ? "Failed to delete task"
          : "Failed to remove task",
        message: errMsg,
      });
    }
  };

  // Global Action Handlers
  const handlePauseAll = async () => {
    try {
      await pauseAll();
      await showToast({
        style: Toast.Style.Success,
        title: "All Tasks Paused",
      });
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to pause all tasks",
        message: errMsg,
      });
    }
  };

  const handleResumeAll = async () => {
    try {
      await unpauseAll();
      await showToast({
        style: Toast.Style.Success,
        title: "All Tasks Resumed",
      });
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to resume all tasks",
        message: errMsg,
      });
    }
  };

  const handlePurgeHistory = async () => {
    try {
      await purgeDownloadResult();
      await showToast({
        style: Toast.Style.Success,
        title: "Cleared Finished Tasks",
      });
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to clear history",
        message: errMsg,
      });
    }
  };

  // Helper calculations
  const getPercent = (task: Aria2Task): number => {
    const total = parseInt(task.totalLength, 10);
    const completed = parseInt(task.completedLength, 10);
    if (!total || isNaN(total) || isNaN(completed)) return 0;
    return Math.round((completed / total) * 100);
  };

  const getTaskIcon = (task: Aria2Task) => {
    if (task.status === "active")
      return { source: Icon.Download, tintColor: Color.Green };
    if (task.status === "waiting" || task.status === "paused")
      return { source: Icon.Pause, tintColor: Color.Yellow };
    if (task.status === "complete")
      return { source: Icon.CheckCircle, tintColor: Color.Blue };
    return { source: Icon.XmarkCircle, tintColor: Color.Red };
  };

  const getItemAccessories = (task: Aria2Task) => {
    const accessories: List.Item.Accessory[] = [];

    if (task.status === "active") {
      const pct = getPercent(task);
      accessories.push(
        { text: `${pct}%`, tooltip: "Progress" },
        {
          tag: {
            value: formatSpeed(task.downloadSpeed),
            color: Color.Green,
          },
          tooltip: "Download speed",
        },
        {
          text: `ETA: ${formatEta(task.totalLength, task.completedLength, task.downloadSpeed)}`,
          tooltip: "Time remaining",
        },
      );
    } else if (task.status === "waiting" || task.status === "paused") {
      const pct = getPercent(task);
      accessories.push(
        { text: `${pct}%`, tooltip: "Progress" },
        {
          tag: {
            value: "Paused",
            color: Color.Yellow,
          },
        },
      );
    } else if (task.status === "complete") {
      accessories.push(
        { text: formatBytes(task.totalLength), tooltip: "File size" },
        {
          tag: {
            value: "Completed",
            color: Color.Blue,
          },
        },
      );
    } else if (task.status === "error") {
      accessories.push({
        tag: {
          value: "Error",
          color: Color.Red,
        },
        tooltip: task.errorMessage || `Error Code: ${task.errorCode}`,
      });
    }

    return accessories;
  };

  // Render global controls in the ActionPanel
  const renderGlobalActions = () => (
    <>
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
        onAction={() => setRefreshTrigger((prev) => prev + 1)}
      />
      <Action
        title="Pause All Tasks"
        icon={Icon.Pause}
        shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
        onAction={handlePauseAll}
      />
      <Action
        title="Resume All Tasks"
        icon={Icon.Play}
        shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
        onAction={handleResumeAll}
      />
      <Action
        title="Clear Completed History"
        icon={Icon.Trash}
        shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
        onAction={handlePurgeHistory}
      />
    </>
  );

  if (daemonError) {
    return (
      <List>
        <List.EmptyView
          icon={{ source: Icon.WifiDisabled, tintColor: Color.Red }}
          title="Cannot connect to Aria2 RPC"
          description={`Error: ${daemonError}\n\nPlease check extension preferences or verify if port 6800 is open.`}
          actions={
            <ActionPanel>
              <Action
                title="Retry Connection"
                onAction={() => setRefreshTrigger((prev) => prev + 1)}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search downloads...">
      {tasks.length === 0 ? (
        <List.EmptyView
          title="No Downloads"
          description="Your download queue is empty. Use 'Add Download' to queue new links."
          actions={<ActionPanel>{renderGlobalActions()}</ActionPanel>}
        />
      ) : (
        tasks.map((task) => {
          const firstFile = task.files?.[0];
          const hasFilePath =
            firstFile && firstFile.path && firstFile.path !== "";

          return (
            <List.Item
              key={task.gid}
              icon={getTaskIcon(task)}
              title={getTaskName(task)}
              subtitle={`${formatBytes(task.completedLength)} / ${formatBytes(task.totalLength)}`}
              accessories={getItemAccessories(task)}
              actions={
                <ActionPanel>
                  {/* Push Detail view as primary enter-key action */}
                  <Action.Push
                    title="View Progress Details"
                    icon={Icon.Eye}
                    target={<DetailTask gid={task.gid} />}
                  />

                  {task.status === "active" && (
                    <Action
                      title="Pause Download"
                      icon={Icon.Pause}
                      onAction={() => handlePause(task.gid)}
                    />
                  )}
                  {(task.status === "waiting" || task.status === "paused") && (
                    <Action
                      title="Resume Download"
                      icon={Icon.Play}
                      onAction={() => handleResume(task.gid)}
                    />
                  )}
                  <Action
                    title={deleteFileOnRemove ? "Delete Task" : "Remove Task"}
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    onAction={() => handleRemove(task)}
                  />

                  {hasFilePath && (
                    <>
                      <Action.ShowInFinder
                        title="Reveal in Finder"
                        path={firstFile.path}
                      />
                      <Action.Open title="Open File" target={firstFile.path} />
                    </>
                  )}

                  {firstFile?.uris?.[0]?.uri && (
                    <Action.CopyToClipboard
                      title="Copy Source URL"
                      content={firstFile.uris[0].uri}
                      shortcut={{ modifiers: ["cmd"], key: "c" }}
                    />
                  )}

                  <ActionPanel.Section title="Global Controls">
                    {renderGlobalActions()}
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
