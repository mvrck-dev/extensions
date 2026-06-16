import {
  Form,
  ActionPanel,
  Action,
  showToast,
  Toast,
  useNavigation,
  getPreferenceValues,
  LocalStorage,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { startAria2Daemon } from "./utils/daemon";
import { addUri } from "./utils/aria2rpc";
import TasksList from "./tasks";
import os from "os";

interface FormValues {
  uris: string;
  dirs?: string[];
  rename?: string;
  split: string;
  showAdvanced: boolean;
  userAgent?: string;
  authorization?: string;
  referer?: string;
  cookie?: string;
  proxy?: string;
  navigate: boolean;
}

export default function Command() {
  const { push, pop } = useNavigation();
  const [isLoading, setIsLoading] = useState(true);
  const [daemonError, setDaemonError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [defaultDir, setDefaultDir] = useState("~/Downloads");
  const [shouldNavigate, setShouldNavigate] = useState(true);

  // Initialize daemon on mount
  useEffect(() => {
    async function initDaemon() {
      try {
        await startAria2Daemon();

        // Load custom defaults from LocalStorage
        try {
          const stored = await LocalStorage.getItem<string>(
            "aria2_custom_config",
          );
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.downloadDir) {
              setDefaultDir(parsed.downloadDir);
            }
            if (parsed.showDownloadingAfterAdd !== undefined) {
              setShouldNavigate(parsed.showDownloadingAfterAdd);
            }
          } else {
            setDefaultDir("~/Downloads");
          }
        } catch {
          setDefaultDir("~/Downloads");
        }

        setIsLoading(false);
      } catch (err: unknown) {
        console.error(err);
        const errMsg = err instanceof Error ? err.message : String(err);
        setDaemonError(errMsg);
        setIsLoading(false);
        await showToast({
          style: Toast.Style.Failure,
          title: "Daemon Initialization Failed",
          message: "Make sure aria2c is installed or configured properly.",
        });
      }
    }
    initDaemon();
  }, []);

  const handleSubmit = async (values: FormValues) => {
    const preferences = getPreferenceValues();
    const lines = values.uris
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Validation Error",
        message: "Please enter at least one download link.",
      });
      return;
    }

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Adding downloads...",
    });

    try {
      const options: Record<string, string | string[]> = {};

      // Save Folder
      const selectedDir =
        values.dirs && values.dirs.length > 0 ? values.dirs[0] : defaultDir;
      options.dir = selectedDir.replace(/^~/, os.homedir());

      // Rename (only applicable if a single URL is submitted)
      if (values.rename && lines.length === 1) {
        options.out = values.rename;
      }

      // Connection Splits
      if (values.split) {
        options.split = values.split;
        const maxConn = Math.min(16, parseInt(values.split, 10)).toString();
        options["max-connection-per-server"] = maxConn;
      }

      // SSL Verification
      if (preferences.checkCertificate === true) {
        options["check-certificate"] = "true";
      } else {
        options["check-certificate"] = "false";
      }

      // Advanced Options
      if (values.showAdvanced) {
        if (values.userAgent) {
          options["user-agent"] = values.userAgent;
        }
        if (values.referer) {
          options.referer = values.referer;
        }
        if (values.proxy) {
          options["all-proxy"] = values.proxy;
        }

        const headers: string[] = [];
        if (values.authorization) {
          headers.push(`Authorization: ${values.authorization}`);
        }
        if (values.cookie) {
          headers.push(`Cookie: ${values.cookie}`);
        }
        if (headers.length > 0) {
          options.header = headers;
        }
      }

      // Add each URI
      for (const uri of lines) {
        await addUri([uri], options);
      }

      toast.style = Toast.Style.Success;
      toast.title = "Added successfully";
      toast.message = `${lines.length} download task(s) queued.`;

      // Navigation routing
      if (values.navigate) {
        push(<TasksList />);
      } else {
        pop();
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to add downloads";
      toast.message = errMsg;
    }
  };

  if (daemonError) {
    return (
      <Form
        actions={
          <ActionPanel>
            <Action
              title="Retry"
              onAction={() => {
                setIsLoading(true);
                setDaemonError(null);
                startAria2Daemon()
                  .then(() => setIsLoading(false))
                  .catch((err) => {
                    setDaemonError(err.message);
                    setIsLoading(false);
                  });
              }}
            />
          </ActionPanel>
        }
      >
        <Form.Description text="Error: Could not connect to the Aria2 RPC server." />
        <Form.Description text={`Details: ${daemonError}`} />
        <Form.Description text="Please make sure: " />
        <Form.Description text="1. The local port (6800) is not occupied by another app." />
        <Form.Description text="2. If using a remote server, check your secret token and port in Preferences." />
      </Form>
    );
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Start Download" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="uris"
        title="Download Links"
        placeholder="Paste HTTP/HTTPS/FTP URLs or Magnet links here (one per line)..."
        info="Supports HTTP, HTTPS, FTP, SFTP, and Magnet links."
      />
      <Form.FilePicker
        id="dirs"
        title="Save To"
        canChooseDirectories={true}
        canChooseFiles={false}
        allowMultipleSelection={false}
        info={`Browse and select the save directory (falls back to default settings: ${defaultDir} if unselected).`}
      />
      <Form.TextField
        id="rename"
        title="Rename File"
        placeholder="Optional new filename (only applies for a single download link)..."
      />
      <Form.Dropdown
        id="split"
        title="Split Connection"
        defaultValue="64"
        info="Maximum number of connections to one server for each download."
      >
        <Form.Dropdown.Item title="1 connection" value="1" />
        <Form.Dropdown.Item title="2 connections" value="2" />
        <Form.Dropdown.Item title="4 connections" value="4" />
        <Form.Dropdown.Item title="8 connections" value="8" />
        <Form.Dropdown.Item title="16 connections" value="16" />
        <Form.Dropdown.Item title="32 connections" value="32" />
        <Form.Dropdown.Item title="64 connections (Default)" value="64" />
        <Form.Dropdown.Item title="128 connections" value="128" />
      </Form.Dropdown>

      <Form.Checkbox
        id="showAdvanced"
        label="Advanced Options"
        value={showAdvanced}
        onChange={setShowAdvanced}
      />

      {showAdvanced && (
        <>
          <Form.TextField
            id="userAgent"
            title="User-Agent"
            placeholder="Custom User-Agent header..."
          />
          <Form.TextField
            id="authorization"
            title="Authorization"
            placeholder="Token / Basic Authentication..."
          />
          <Form.TextField
            id="referer"
            title="Referer"
            placeholder="Custom HTTP Referer URL..."
          />
          <Form.TextField
            id="cookie"
            title="Cookie"
            placeholder="Custom Cookie string..."
          />
          <Form.TextField
            id="proxy"
            title="Proxy"
            placeholder="[http://][user:password@]host[:port]"
          />
        </>
      )}

      <Form.Separator />

      <Form.Checkbox
        id="navigate"
        label="Navigate to Downloading"
        defaultValue={shouldNavigate}
      />
    </Form>
  );
}
