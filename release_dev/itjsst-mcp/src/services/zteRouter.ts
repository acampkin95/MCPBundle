import { CommandRunner } from "../utils/commandRunner.js";

/**
 * ZTE Router Service
 *
 * Manages ZTE routers (including NH8091 / Optus Ultra WiFi 5G) via HTTP API
 *
 * Common ZTE models: NH8091, MF286, MF920, MC801A
 * Default IP: 192.168.1.1 or 192.168.0.1
 * API Pattern: /goform/goform_get_cmd_process (GET) and /goform/goform_set_cmd_process (POST)
 */

export interface ZteConnectionOptions {
  readonly host: string;           // Router IP (e.g., 192.168.1.1)
  readonly username?: string;      // Usually "admin" or "user"
  readonly password: string;       // Admin password
  readonly port?: number;          // HTTP port (default: 80)
  readonly protocol?: "http" | "https";
}

export type ZteOperation =
  | "status"                      // Get device status (signal, network, uptime)
  | "signal-strength"             // Get 5G/LTE signal details
  | "network-info"                // Get network registration info (operator, band, mode)
  | "wan-info"                    // Get WAN IP, gateway, DNS
  | "device-info"                 // Get IMEI, model, firmware
  | "connected-devices"           // List DHCP clients
  | "wifi-status"                 // Get WiFi SSID, encryption, clients
  | "wifi-config"                 // Update WiFi SSID/password
  | "reboot"                      // Reboot the router
  | "sms-list"                    // List SMS messages
  | "sms-send"                    // Send SMS
  | "data-usage"                  // Get data usage statistics
  | "apn-settings"                // Get/Set APN configuration
  | "band-selection"              // Set 5G/LTE band selection
  | "login"                       // Authenticate session
  | "logout";                     // End session

export interface ZteOperationOptions extends ZteConnectionOptions {
  readonly operation: ZteOperation;
  readonly dryRun?: boolean;

  // Operation-specific parameters
  readonly ssid?: string;                    // For wifi-config
  readonly wifiPassword?: string;            // For wifi-config
  readonly phoneNumber?: string;             // For sms-send
  readonly smsMessage?: string;              // For sms-send
  readonly apnName?: string;                 // For apn-settings
  readonly apnUsername?: string;             // For apn-settings
  readonly apnPassword?: string;             // For apn-settings
  readonly bandMode?: string;                // For band-selection (e.g., "5G_AUTO", "LTE_BAND_28")
}

export interface ZteResult {
  readonly success: boolean;
  readonly operation: ZteOperation;
  readonly data?: Record<string, unknown>;
  readonly message?: string;
  readonly rawOutput?: string;
}

/**
 * ZTE Router Service
 *
 * Uses curl to interact with ZTE router HTTP API
 */
export class ZteRouterService {
  public constructor(private readonly runner: CommandRunner) {}

  public async executeOperation(options: ZteOperationOptions): Promise<ZteResult> {
    const { operation, dryRun = false } = options;

    if (dryRun && this.isWriteOperation(operation)) {
      return {
        success: true,
        operation,
        message: `[DRY RUN] Would execute: ${operation}`,
      };
    }

    // All operations require login first (except login itself)
    if (operation !== "login") {
      const loginResult = await this.login(options);
      if (!loginResult.success) {
        return loginResult;
      }
    }

    switch (operation) {
      case "login":
        return this.login(options);
      case "logout":
        return this.logout(options);
      case "status":
        return this.getStatus(options);
      case "signal-strength":
        return this.getSignalStrength(options);
      case "network-info":
        return this.getNetworkInfo(options);
      case "wan-info":
        return this.getWanInfo(options);
      case "device-info":
        return this.getDeviceInfo(options);
      case "connected-devices":
        return this.getConnectedDevices(options);
      case "wifi-status":
        return this.getWifiStatus(options);
      case "wifi-config":
        return this.setWifiConfig(options);
      case "reboot":
        return this.reboot(options);
      case "sms-list":
        return this.listSms(options);
      case "sms-send":
        return this.sendSms(options);
      case "data-usage":
        return this.getDataUsage(options);
      case "apn-settings":
        return this.getApnSettings(options);
      case "band-selection":
        return this.setBandSelection(options);
      default:
        return {
          success: false,
          operation,
          message: `Unknown operation: ${operation}`,
        };
    }
  }

  private isWriteOperation(operation: ZteOperation): boolean {
    const writeOps: ZteOperation[] = ["wifi-config", "reboot", "sms-send", "apn-settings", "band-selection", "logout"];
    return writeOps.includes(operation);
  }

  private buildUrl(options: ZteConnectionOptions, endpoint: string): string {
    const protocol = options.protocol ?? "http";
    const port = options.port ?? 80;
    const portSuffix = port === 80 ? "" : `:${port}`;
    return `${protocol}://${options.host}${portSuffix}${endpoint}`;
  }

  private async apiGet(options: ZteConnectionOptions, cmd: string): Promise<ZteResult> {
    const url = this.buildUrl(options, `/goform/goform_get_cmd_process?isTest=false&cmd=${cmd}`);
    const curlCmd = `curl -s -X GET "${url}" -H "Referer: ${this.buildUrl(options, "/")}"`;

    try {
      const result = await this.runner.run(curlCmd, { requiresSudo: false, timeoutMs: 10000 });

      if (result.code === 0) {
        try {
          const data = JSON.parse(result.stdout);
          return {
            success: true,
            operation: "status",
            data: data as Record<string, unknown>,
            rawOutput: result.stdout,
          };
        } catch {
          return {
            success: true,
            operation: "status",
            rawOutput: result.stdout,
            message: "Response is not JSON",
          };
        }
      }

      return {
        success: false,
        operation: "status",
        message: `API GET failed: ${result.stderr}`,
        rawOutput: result.stdout,
      };
    } catch (error) {
      return {
        success: false,
        operation: "status",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async apiPost(options: ZteConnectionOptions, goformId: string, data: string): Promise<ZteResult> {
    const url = this.buildUrl(options, "/goform/goform_set_cmd_process");
    const postData = `isTest=false&goformId=${goformId}&${data}`;
    const curlCmd = `curl -s -X POST "${url}" -H "Referer: ${this.buildUrl(options, "/")}" -H "Content-Type: application/x-www-form-urlencoded" -d "${postData}"`;

    try {
      const result = await this.runner.run(curlCmd, { requiresSudo: false, timeoutMs: 15000 });

      if (result.code === 0) {
        try {
          const responseData = JSON.parse(result.stdout);
          return {
            success: true,
            operation: "status",
            data: responseData as Record<string, unknown>,
            rawOutput: result.stdout,
          };
        } catch {
          return {
            success: true,
            operation: "status",
            rawOutput: result.stdout,
            message: "Response is not JSON",
          };
        }
      }

      return {
        success: false,
        operation: "status",
        message: `API POST failed: ${result.stderr}`,
        rawOutput: result.stdout,
      };
    } catch (error) {
      return {
        success: false,
        operation: "status",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async login(options: ZteConnectionOptions): Promise<ZteResult> {
    const result = await this.apiPost(options, "LOGIN", `password=${encodeURIComponent(options.password)}`);
    return { ...result, operation: "login" };
  }

  private async logout(options: ZteConnectionOptions): Promise<ZteResult> {
    const result = await this.apiPost(options, "LOGOFF", "");
    return { ...result, operation: "logout" };
  }

  private async getStatus(options: ZteConnectionOptions): Promise<ZteResult> {
    // Get comprehensive status including signal, network, connection
    const cmd = "wan_ipaddr,network_type,network_provider,cell_id,rssi,rsrp,rsrq,sinr,wan_active_band";
    const result = await this.apiGet(options, cmd);
    return { ...result, operation: "status" };
  }

  private async getSignalStrength(options: ZteConnectionOptions): Promise<ZteResult> {
    const cmd = "rssi,rsrp,rsrq,sinr,rscp,ecio,Z5g_SINR,Z5g_rsrp";
    const result = await this.apiGet(options, cmd);
    return { ...result, operation: "signal-strength" };
  }

  private async getNetworkInfo(options: ZteConnectionOptions): Promise<ZteResult> {
    const cmd = "network_type,network_provider,wan_active_band,cell_id,pci,rmcc,rmnc,roam_setting_option";
    const result = await this.apiGet(options, cmd);
    return { ...result, operation: "network-info" };
  }

  private async getWanInfo(options: ZteConnectionOptions): Promise<ZteResult> {
    const cmd = "wan_ipaddr,ipv6_wan_ipaddr,wan_gateway,ipv6_wan_gateway,prefer_dns_manual,prefer_dns_auto";
    const result = await this.apiGet(options, cmd);
    return { ...result, operation: "wan-info" };
  }

  private async getDeviceInfo(options: ZteConnectionOptions): Promise<ZteResult> {
    const cmd = "imei,wan_active_band,hardware_version,web_version,wa_inner_version,cr_version,model_name";
    const result = await this.apiGet(options, cmd);
    return { ...result, operation: "device-info" };
  }

  private async getConnectedDevices(options: ZteConnectionOptions): Promise<ZteResult> {
    const cmd = "station_list";
    const result = await this.apiGet(options, cmd);
    return { ...result, operation: "connected-devices" };
  }

  private async getWifiStatus(options: ZteConnectionOptions): Promise<ZteResult> {
    const cmd = "wifi_ssid1,wifi_password1,AuthMode,wifi_cur_state,MAX_Access_num,m_station_list";
    const result = await this.apiGet(options, cmd);
    return { ...result, operation: "wifi-status" };
  }

  private async setWifiConfig(options: ZteOperationOptions): Promise<ZteResult> {
    if (!options.ssid || !options.wifiPassword) {
      return {
        success: false,
        operation: "wifi-config",
        message: "wifi-config requires ssid and wifiPassword parameters",
      };
    }

    const data = `ssid=${encodeURIComponent(options.ssid)}&wpapsk1=${encodeURIComponent(options.wifiPassword)}`;
    const result = await this.apiPost(options, "SET_WIFI_INFO", data);
    return { ...result, operation: "wifi-config" };
  }

  private async reboot(options: ZteConnectionOptions): Promise<ZteResult> {
    const result = await this.apiPost(options, "REBOOT_DEVICE", "");
    return { ...result, operation: "reboot" };
  }

  private async listSms(options: ZteConnectionOptions): Promise<ZteResult> {
    const cmd = "sms_data_total";
    const result = await this.apiGet(options, cmd);
    return { ...result, operation: "sms-list" };
  }

  private async sendSms(options: ZteOperationOptions): Promise<ZteResult> {
    if (!options.phoneNumber || !options.smsMessage) {
      return {
        success: false,
        operation: "sms-send",
        message: "sms-send requires phoneNumber and smsMessage parameters",
      };
    }

    const data = `notCallback=true&Number=${encodeURIComponent(options.phoneNumber)}&sms_time=&MessageBody=${encodeURIComponent(options.smsMessage)}&ID=-1&encode_type=GSM7_default`;
    const result = await this.apiPost(options, "SEND_SMS", data);
    return { ...result, operation: "sms-send" };
  }

  private async getDataUsage(options: ZteConnectionOptions): Promise<ZteResult> {
    const cmd = "monthly_rx_bytes,monthly_tx_bytes,monthly_time,data_volume_limit_switch,data_volume_limit_size";
    const result = await this.apiGet(options, cmd);
    return { ...result, operation: "data-usage" };
  }

  private async getApnSettings(options: ZteConnectionOptions): Promise<ZteResult> {
    const cmd = "apn_mode,m_profile_name,wan_apn,ppp_username,ppp_passwd,pdp_type,pdp_select";
    const result = await this.apiGet(options, cmd);
    return { ...result, operation: "apn-settings" };
  }

  private async setBandSelection(options: ZteOperationOptions): Promise<ZteResult> {
    if (!options.bandMode) {
      return {
        success: false,
        operation: "band-selection",
        message: "band-selection requires bandMode parameter (e.g., 5G_AUTO, LTE_BAND_28)",
      };
    }

    const data = `network_mode=${encodeURIComponent(options.bandMode)}`;
    const result = await this.apiPost(options, "SET_BEARER_PREFERENCE", data);
    return { ...result, operation: "band-selection" };
  }

  public listOperations(): Array<{ operation: ZteOperation; description: string; writesData: boolean }> {
    return [
      { operation: "status", description: "Get comprehensive device status (signal, network, IP)", writesData: false },
      { operation: "signal-strength", description: "Get detailed signal metrics (RSSI, RSRP, RSRQ, SINR)", writesData: false },
      { operation: "network-info", description: "Get network registration info (operator, band, cell ID)", writesData: false },
      { operation: "wan-info", description: "Get WAN IP, gateway, DNS settings", writesData: false },
      { operation: "device-info", description: "Get IMEI, model, firmware version", writesData: false },
      { operation: "connected-devices", description: "List connected DHCP clients", writesData: false },
      { operation: "wifi-status", description: "Get WiFi SSID, password, connected clients", writesData: false },
      { operation: "wifi-config", description: "Update WiFi SSID and password (requires ssid, wifiPassword)", writesData: true },
      { operation: "reboot", description: "Reboot the router", writesData: true },
      { operation: "sms-list", description: "List all SMS messages", writesData: false },
      { operation: "sms-send", description: "Send SMS (requires phoneNumber, smsMessage)", writesData: true },
      { operation: "data-usage", description: "Get monthly data usage statistics", writesData: false },
      { operation: "apn-settings", description: "Get APN configuration", writesData: false },
      { operation: "band-selection", description: "Set 5G/LTE band preference (requires bandMode)", writesData: true },
      { operation: "login", description: "Authenticate to router API", writesData: false },
      { operation: "logout", description: "End authenticated session", writesData: true },
    ];
  }
}
