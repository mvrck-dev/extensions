import {
  Form,
  ActionPanel,
  Action,
  showToast,
  Toast,
  LocalStorage,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import os from "os";

interface CustomConfig {
  downloadDir: string;
  uploadLimit: string;
  uploadLimitUnit: string;
  downloadLimit: string;
  downloadLimitUnit: string;
  saveMagnetAsTorrent: boolean;
  autoDownloadMagnetTorrent: boolean;
  btForceEncryption: boolean;
  keepSeeding: boolean;
  seedRatio: string;
  seedTime: string;
  maxActiveTasks: string;
  maxConnectionsPerServer: string;
  continueDownload: boolean;
  showDownloadingAfterAdd: boolean;
  notifyOnComplete: boolean;
  userAgent: string;
  defaultMagnet: boolean;
  defaultThunder: boolean;
  deleteFileOnRemove: boolean;
}

const DEFAULTS: CustomConfig = {
  downloadDir: os.homedir() + "/Downloads",
  uploadLimit: "0",
  uploadLimitUnit: "KB",
  downloadLimit: "0",
  downloadLimitUnit: "KB",
  saveMagnetAsTorrent: true,
  autoDownloadMagnetTorrent: true,
  btForceEncryption: false,
  keepSeeding: false,
  seedRatio: "1.0",
  seedTime: "60",
  maxActiveTasks: "5",
  maxConnectionsPerServer: "16",
  continueDownload: true,
  showDownloadingAfterAdd: true,
  notifyOnComplete: true,
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36",
  defaultMagnet: true,
  defaultThunder: false,
  deleteFileOnRemove: false,
};

interface FormValues extends Omit<CustomConfig, "downloadDir"> {
  downloadDir: string[];
}

export default function Command() {
  const [config, setConfig] = useState<CustomConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userAgent, setUserAgent] = useState(DEFAULTS.userAgent);
  const { pop } = useNavigation();

  useEffect(() => {
    async function loadConfig() {
      try {
        const stored = await LocalStorage.getItem<string>(
          "aria2_custom_config",
        );
        if (stored) {
          const parsed = JSON.parse(stored);
          setConfig(parsed);
          if (parsed.userAgent) {
            setUserAgent(parsed.userAgent);
          }
        } else {
          setConfig(DEFAULTS);
        }
      } catch (e) {
        setConfig(DEFAULTS);
      } finally {
        setIsLoading(false);
      }
    }
    loadConfig();
  }, []);

  const handlePresetChange = (value: string) => {
    if (value === "chrome") {
      setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36",
      );
    } else if (value === "aria2") {
      setUserAgent("aria2/1.37.0");
    } else if (value === "transmission") {
      setUserAgent("Transmission/3.00");
    } else if (value === "du") {
      setUserAgent("Wget/1.21.1");
    }
  };

  const handleSubmit = async (values: FormValues) => {
    try {
      const configToSave = {
        ...values,
        downloadDir:
          values.downloadDir && values.downloadDir.length > 0
            ? values.downloadDir[0]
            : os.homedir() + "/Downloads",
        userAgent, // Handled by state
      };
      await LocalStorage.setItem(
        "aria2_custom_config",
        JSON.stringify(configToSave),
      );
      await showToast({
        style: Toast.Style.Success,
        title: "Configuration Saved",
        message: "Settings will apply immediately.",
      });
      pop();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to save configuration",
        message: errMsg,
      });
    }
  };

  if (isLoading || !config) {
    return <Form isLoading={true} />;
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Configuration"
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="downloadDir"
        title="Default Path"
        allowMultipleSelection={false}
        canChooseDirectories={true}
        canChooseFiles={false}
        defaultValue={
          config?.downloadDir ? [config.downloadDir] : [DEFAULTS.downloadDir]
        }
      />

      <Form.Separator />

      <Form.Description text="Transmission Limit Settings" />
      <Form.TextField
        id="downloadLimit"
        title="Download Limit"
        placeholder="0"
        defaultValue={config?.downloadLimit ?? DEFAULTS.downloadLimit}
      />
      <Form.Dropdown
        id="downloadLimitUnit"
        title="Download Limit Unit"
        defaultValue={config?.downloadLimitUnit ?? DEFAULTS.downloadLimitUnit}
      >
        <Form.Dropdown.Item value="KB" title="KB/s" />
        <Form.Dropdown.Item value="MB" title="MB/s" />
      </Form.Dropdown>

      <Form.TextField
        id="uploadLimit"
        title="Upload Limit"
        placeholder="0"
        defaultValue={config?.uploadLimit ?? DEFAULTS.uploadLimit}
      />
      <Form.Dropdown
        id="uploadLimitUnit"
        title="Upload Limit Unit"
        defaultValue={config?.uploadLimitUnit ?? DEFAULTS.uploadLimitUnit}
      >
        <Form.Dropdown.Item value="KB" title="KB/s" />
        <Form.Dropdown.Item value="MB" title="MB/s" />
      </Form.Dropdown>

      <Form.Separator />

      <Form.Description text="BitTorrent Settings" />
      <Form.Checkbox
        id="saveMagnetAsTorrent"
        label="Save magnet link as torrent file"
        defaultValue={
          config?.saveMagnetAsTorrent ?? DEFAULTS.saveMagnetAsTorrent
        }
      />
      <Form.Checkbox
        id="autoDownloadMagnetTorrent"
        label="Automatically download magnet and torrent content"
        defaultValue={
          config?.autoDownloadMagnetTorrent ??
          DEFAULTS.autoDownloadMagnetTorrent
        }
      />
      <Form.Checkbox
        id="btForceEncryption"
        label="BT force encryption"
        defaultValue={config?.btForceEncryption ?? DEFAULTS.btForceEncryption}
      />
      <Form.Checkbox
        id="keepSeeding"
        label="Keep seeding until manually stopped"
        defaultValue={config?.keepSeeding ?? DEFAULTS.keepSeeding}
      />
      <Form.TextField
        id="seedRatio"
        title="Seed Ratio"
        placeholder="1.0"
        defaultValue={config?.seedRatio ?? DEFAULTS.seedRatio}
      />
      <Form.TextField
        id="seedTime"
        title="Seed Time (minutes)"
        placeholder="60"
        defaultValue={config?.seedTime ?? DEFAULTS.seedTime}
      />

      <Form.Separator />

      <Form.Description text="Task Management" />
      <Form.Dropdown
        id="maxActiveTasks"
        title="Maximum Active Tasks"
        defaultValue={config?.maxActiveTasks ?? DEFAULTS.maxActiveTasks}
      >
        <Form.Dropdown.Item value="1" title="1" />
        <Form.Dropdown.Item value="2" title="2" />
        <Form.Dropdown.Item value="3" title="3" />
        <Form.Dropdown.Item value="4" title="4" />
        <Form.Dropdown.Item value="5" title="5" />
        <Form.Dropdown.Item value="10" title="10" />
      </Form.Dropdown>

      <Form.Dropdown
        id="maxConnectionsPerServer"
        title="Maximum Connections per Server"
        defaultValue={
          config?.maxConnectionsPerServer ?? DEFAULTS.maxConnectionsPerServer
        }
      >
        <Form.Dropdown.Item value="1" title="1" />
        <Form.Dropdown.Item value="2" title="2" />
        <Form.Dropdown.Item value="4" title="4" />
        <Form.Dropdown.Item value="8" title="8" />
        <Form.Dropdown.Item value="16" title="16" />
        <Form.Dropdown.Item value="32" title="32 (Capped to 16 in daemon)" />
        <Form.Dropdown.Item value="64" title="64 (Capped to 16 in daemon)" />
      </Form.Dropdown>

      <Form.Checkbox
        id="continueDownload"
        label="Continue incomplete downloads"
        defaultValue={config?.continueDownload ?? DEFAULTS.continueDownload}
      />
      <Form.Checkbox
        id="showDownloadingAfterAdd"
        label="Automatically show downloading after adding task"
        defaultValue={
          config?.showDownloadingAfterAdd ?? DEFAULTS.showDownloadingAfterAdd
        }
      />
      <Form.Checkbox
        id="notifyOnComplete"
        label="Notify after download is complete"
        defaultValue={config?.notifyOnComplete ?? DEFAULTS.notifyOnComplete}
      />
      <Form.Checkbox
        id="deleteFileOnRemove"
        label="Delete downloaded files from disk when removing task"
        defaultValue={config?.deleteFileOnRemove ?? DEFAULTS.deleteFileOnRemove}
      />

      <Form.Separator />

      <Form.Description text="User-Agent Settings" />
      <Form.Dropdown
        id="presetUserAgent"
        title="Preset User-Agent"
        onChange={handlePresetChange}
        defaultValue="chrome"
      >
        <Form.Dropdown.Item value="chrome" title="Chrome" />
        <Form.Dropdown.Item value="aria2" title="Aria2" />
        <Form.Dropdown.Item value="transmission" title="Transmission" />
        <Form.Dropdown.Item value="du" title="du (Wget)" />
      </Form.Dropdown>
      <Form.TextArea
        id="userAgent"
        title="Mock User-Agent"
        value={userAgent}
        onChange={setUserAgent}
      />

      <Form.Separator />

      <Form.Description text="Protocols" />
      <Form.Checkbox
        id="defaultMagnet"
        label="Set as default client for Magnet [ magnet:// ]"
        defaultValue={config?.defaultMagnet ?? DEFAULTS.defaultMagnet}
      />
      <Form.Checkbox
        id="defaultThunder"
        label="Set as default client for Thunder [ thunder:// ]"
        defaultValue={config?.defaultThunder ?? DEFAULTS.defaultThunder}
      />
    </Form>
  );
}
