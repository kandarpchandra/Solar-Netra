import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, PermissionsAndroid, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import RNBluetoothClassic, { BluetoothDevice, BluetoothDeviceReadEvent } from 'react-native-bluetooth-classic';

import DryingModal from './src/components/DryingModal';
import { DryingProvider, useDrying } from './src/components/DryingProcessContext';
import FileDownloadModal from './src/components/FileDownloadModal';
import SettingsModal from './src/components/SettingsModal';
import { commonStyles } from './src/styles/appStyles';

type SensorData = {
  temp: string;
  hum: string;
};

type SystemData = {
  power: string;
  solar: string;
  weight: string;
  sensors: {
    IN: SensorData;
    MID: SensorData;
    OUT: SensorData;
  };
};

type AppConfig = {
  calibration_factor: number;
  solar_threshold_low: number;
  solar_threshold_high: number;
  min_dwell_time: number;
  reinit_interval: number;
  sd_log_interval: number;
  display_interval: number;
  bluetooth_interval: number;
};

const DEFAULT_CONFIG: AppConfig = {
  calibration_factor: 1071.5,
  solar_threshold_low: 5.0,
  solar_threshold_high: 13.0,
  min_dwell_time: 5000,
  reinit_interval: 60000,
  sd_log_interval: 2000,
  display_interval: 5000,
  bluetooth_interval: 5000,
};

export default function Page() {
  return (
    <DryingProvider>
      <MainAppContent />
    </DryingProvider>
  );
}

function MainAppContent() {
  const [bluetoothAvailable, setBluetoothAvailable] = useState(false);
  const [bluetoothEnabled, setBluetoothEnabled] = useState(false);
  const [bondedDevices, setBondedDevices] = useState<BluetoothDevice[]>([]);
  const [discoveredDevices, setDiscoveredDevices] = useState<BluetoothDevice[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
  const [dataToSend, setDataToSend] = useState('');
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [systemData, setSystemData] = useState<SystemData>({
    power: '',
    solar: '',
    weight: '',
    sensors: {
      IN: { temp: '', hum: '' },
      MID: { temp: '', hum: '' },
      OUT: { temp: '', hum: '' }
    }
  });

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [currentConfig, setCurrentConfig] = useState(DEFAULT_CONFIG);
  const [showDryingModal, setShowDryingModal] = useState(false);
  const [showFileDownloadModal, setShowFileDownloadModal] = useState(false);
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [dryingModalView, setDryingModalView] = useState<'options' | 'new_drying' | 'continued_drying'>('options');
  const [dryingDuration, setDryingDuration] = useState<string>('00:00:00'); // State to display drying duration

  const {
    currentFruit,
    isDrying,
    currentFilename,
    dryingStartTime,
    lastDryingDetails,
    setDryingProcess,
    resetDryingProcess,
  } = useDrying();

  const isReceivingConfigRef = useRef(false);
  const configBufferRef = useRef<string[]>([]);
  const isReceivingFileListRef = useRef(false);
  const fileListBufferRef = useRef<string[]>([]);
  const fileContentBufferRef = useRef<string[]>([]);
  const currentDownloadingFilenameRef = useRef<string>('');
  const isReceivingFileContentRef = useRef<boolean>(false);
  const [fileContentBuffer, setFileContentBuffer] = useState<string[]>([]);
  
  // Function to add a log message to the activity log
  const addLog = useCallback((message: string) => {
    setLogMessages(prev => [`${new Date().toLocaleTimeString()}: ${message}`, ...prev.slice(0, 50)]);
  }, []);

  // Effect to calculate and display the drying duration
  useEffect(() => {
    let interval: number | null = null; 
    if (isDrying && dryingStartTime) {
      interval = setInterval(() => {
        const elapsedMilliseconds = Date.now() - dryingStartTime;
        const totalSeconds = Math.floor(elapsedMilliseconds / 1000);
        const hours = Math.floor((totalSeconds % 86400) / 3600); // 86400 seconds in a day
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const formatUnit = (unit: number) => unit.toString().padStart(2, '0');
        setDryingDuration(`${formatUnit(hours)}:${formatUnit(minutes)}:${formatUnit(seconds)}`);
      }, 1000);
    } else {
      setDryingDuration('00:00:00'); // Reset when not drying
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isDrying, dryingStartTime]);

  // Function to request necessary Bluetooth permissions for Android
  const requestBluetoothPermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        addLog("Requesting Bluetooth permissions...");
        const grantedLocation = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        const grantedBluetoothScan = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
        );
        const grantedBluetoothConnect = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
        );

        if (grantedLocation === PermissionsAndroid.RESULTS.GRANTED &&
            grantedBluetoothScan === PermissionsAndroid.RESULTS.GRANTED &&
            grantedBluetoothConnect === PermissionsAndroid.RESULTS.GRANTED) {
          addLog("Bluetooth permissions granted!");
          return true;
        } else {
          addLog("Bluetooth permissions denied.");
          Alert.alert("Permission Denied", "Bluetooth functionality will be limited without necessary permissions.");
          return false;
        }
      } catch (err) {
        addLog(`Permission error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        return false;
      }
    }
    return true;
  }, [addLog]);

  // Function to parse configuration data received from Arduino
  const parseConfigBuffer = useCallback((buffer: string[]): AppConfig => {
    const newConfig: Partial<AppConfig> = {};
    buffer.forEach(line => {
      const parts = line.split(':');
      if (parts.length === 2) {
        const key = parts[0].trim();
        const value = parseFloat(parts[1].trim());
        switch (key) {
          case 'CALIB': newConfig.calibration_factor = value; break;
          case 'SOLAR_LOW': newConfig.solar_threshold_low = value; break;
          case 'SOLAR_HIGH': newConfig.solar_threshold_high = value; break;
          case 'DWELL_TIME': newConfig.min_dwell_time = value; break;
          case 'REINIT_INT': newConfig.reinit_interval = value; break;
          case 'SD_LOG_INT': newConfig.sd_log_interval = value; break;
          case 'DISPLAY_INT': newConfig.display_interval = value; break;
          case 'BT_INT': newConfig.bluetooth_interval = value; break;
          default: break;
        }
      }
    });
    return { ...DEFAULT_CONFIG, ...newConfig };
  }, []);

  // Function to send commands to the connected Bluetooth device
  const sendCommand = useCallback(async (command: string) => {
    if (Platform.OS === 'android' && connectedDevice) {
      try {
        const fullCommand = command + '\n'; // Ensure newline is added
        addLog(`Sending command: ${fullCommand.trim()}`);
        console.log('Raw command being sent:', fullCommand);
        
        await connectedDevice.write(fullCommand);
        addLog(`Command sent: ${command}`);
      } catch (error) {
        addLog(`Failed to send command: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
      }
    } else {
      const errorMessage = "Not connected to a device. Cannot send commands.";
      addLog(errorMessage);
      Alert.alert("Not Connected", errorMessage);
      throw new Error(errorMessage);
    }
  }, [connectedDevice, addLog]);

  // Function to request updated configuration from Arduino
  const requestConfigUpdate = useCallback(async () => {
    if (connectedDevice) {
      await sendCommand("GETCONFIG");
    } else {
      addLog("Cannot request config: Not connected to a device.");
      Alert.alert("Not Connected", "Please connect to a device to request configuration.");
    }
  }, [connectedDevice, sendCommand, addLog]);

  // Main effect for setting up Bluetooth listeners and handling incoming data
  useEffect(() => {
    // Initialize Bluetooth on component mount
    const initializeBluetooth = async () => {
      if (Platform.OS === 'android') {
        const permissionsGranted = await requestBluetoothPermissions();
        if (!permissionsGranted) return;
      }

      try {
        const available = await RNBluetoothClassic.isBluetoothAvailable();
        setBluetoothAvailable(available);
        addLog(`Bluetooth available: ${available}`);
        const enabled = await RNBluetoothClassic.isBluetoothEnabled();
        setBluetoothEnabled(enabled);
        addLog(`Bluetooth enabled: ${enabled}`);
        if (enabled) fetchBondedDevices();

        // Listeners for Bluetooth state changes
        const enabledListener = RNBluetoothClassic.onBluetoothEnabled(() => {
          setBluetoothEnabled(true);
          addLog("Bluetooth enabled!");
          fetchBondedDevices();
        });

        const disabledListener = RNBluetoothClassic.onBluetoothDisabled(() => {
          setBluetoothEnabled(false);
          addLog("Bluetooth disabled.");
          setBondedDevices([]);
          setDiscoveredDevices([]);
          setConnectedDevice(null);
          resetDryingProcess(); // Reset drying state on disconnect/BT disable
          setShowDryingModal(false);
          setShowFileDownloadModal(false);
        });

        const errorListener = RNBluetoothClassic.onError((event: any) => {
          const errorMessage = event?.message || event?.error?.message || event?.data || 'Unknown Bluetooth error';
          addLog(`Bluetooth Error: ${errorMessage}`);
          Alert.alert("Bluetooth Error", errorMessage);
          // Also reset drying process on a major Bluetooth error
          resetDryingProcess();
          setShowDryingModal(false);
          setShowFileDownloadModal(false);
        });

        // Cleanup function for listeners
        return () => {
          enabledListener.remove();
          disabledListener.remove();
          errorListener.remove();
        };
      } catch (error) {
        addLog(`Bluetooth Initialization error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    initializeBluetooth();

    // Data listener for the connected device
    let readSubscription: any;
    if (connectedDevice) {
      // When a device connects, reset drying state initially to ensure fresh start
      // This is crucial for re-synchronization.
      addLog("Device connected. Resetting drying state to synchronize with Arduino.");
      resetDryingProcess(); // Ensure fresh state on connect

      readSubscription = connectedDevice.onDataReceived(async (event: BluetoothDeviceReadEvent) => {
        const message = event.data.trim();
        addLog(`Received: ${message}`);

        // Handle configuration data parsing
        if (message.startsWith('CONFIG:')) {
          if (!isReceivingConfigRef.current) { // Check if new config transfer starts
            if (message === 'CONFIG:START') {
              isReceivingConfigRef.current = true;
              configBufferRef.current = [];
              addLog("Arduino: Starting config transfer.");
              return;
            }
          } else { // Continue receiving config data
            if (message === 'CONFIG:END') {
              isReceivingConfigRef.current = false;
              const parsedConfig = parseConfigBuffer(configBufferRef.current);
              setCurrentConfig(parsedConfig);
              addLog("Configuration updated from Arduino.");
              configBufferRef.current = []; // Clear buffer
              return;
            }
            configBufferRef.current.push(message.substring(7)); // Remove 'CONFIG:' prefix
            return;
          }
        }

        // Handle File List
        if (message === "FILES_LIST_START") {
          isReceivingFileListRef.current = true;
          fileListBufferRef.current = [];
          setAvailableFiles([]); // Clear previous list
          addLog("Arduino: Starting file list transfer.");
          return;
        }

        if (message === "FILES_LIST_END" && isReceivingFileListRef.current) {
          isReceivingFileListRef.current = false;
          setAvailableFiles(fileListBufferRef.current);
          addLog(`Arduino: Received ${fileListBufferRef.current.length} files.`);
          setShowFileDownloadModal(true); // Show the modal once list is received
          fileListBufferRef.current = [];
          return;
        }

        if (isReceivingFileListRef.current && message.startsWith("FILE:")) {
          const fileName = message.substring("FILE:".length).trim();
          // Only add non-empty file names
          if (fileName.length > 0) {
            fileListBufferRef.current.push(fileName);
            addLog(`Received file: ${fileName}`);
          } else {
            addLog("Received empty file name, skipping");
          }
          return;
        }

        // Handle Arduino error responses for file operations
        if (message.startsWith("ERROR:") && isReceivingFileListRef.current) {
          isReceivingFileListRef.current = false;
          addLog(`Arduino file error: ${message}`);
          Alert.alert("File Error", `Arduino reported: ${message}`);
          return;
        }

        // Handle File Content
        if (message.startsWith("FILE_CONTENT_START:")) {
          isReceivingFileContentRef.current = true;
          currentDownloadingFilenameRef.current = message.substring("FILE_CONTENT_START:".length).trim();
          fileContentBufferRef.current = [];
          addLog(`Arduino: Receiving content for ${currentDownloadingFilenameRef.current}`);
          addLog(`DEBUG: File transfer started - waiting for data...`);
          return;
        }

        // Handle file size information
        if (message.startsWith("FILE_SIZE:") && isReceivingFileContentRef.current) {
          const fileSize = message.substring("FILE_SIZE:".length).trim();
          addLog(`Arduino: File size is ${fileSize} bytes`);
          return;
        }

        // Handle progress updates
        if (message.startsWith("PROGRESS:") && isReceivingFileContentRef.current) {
          const progress = message.substring("PROGRESS:".length).trim();
          addLog(`Arduino: Transfer progress ${progress}%`);
          return;
        }

        if (message === "FILE_CONTENT_END" && isReceivingFileContentRef.current) {
          isReceivingFileContentRef.current = false;
          addLog(`File '${currentDownloadingFilenameRef.current}' content received successfully. Total lines: ${fileContentBufferRef.current.length}`);
          // Do NOT clear fileContentBufferRef.current or currentDownloadingFilenameRef.current here!
          // Let the FileDownloadModal handle clearing after saving.
          return;
        }

        if (isReceivingFileContentRef.current) {
          // Debug: Log the first few messages to see what's being received
          if (fileContentBufferRef.current.length < 3) {
            addLog(`DEBUG: Raw message received: "${message}"`);
          }
          
          // Only add non-protocol messages to the file content buffer
          if (!message.startsWith("FILE_SIZE:") && !message.startsWith("PROGRESS:")) {
            fileContentBufferRef.current.push(message);
            setFileContentBuffer([...fileContentBufferRef.current]);
            addLog(`Line ${fileContentBufferRef.current.length}: ${message.substring(0, 30)}${message.length > 30 ? '...' : ''}`);
          }
          return;
        }

        // Handle Arduino error responses for file content
        if (message.startsWith("ERROR:") && isReceivingFileContentRef.current) {
          isReceivingFileContentRef.current = false;
          addLog(`Arduino file content error: ${message}`);
          Alert.alert("File Download Error", `Arduino reported: ${message}`);
          fileContentBufferRef.current = [];
          currentDownloadingFilenameRef.current = '';
          return;
        }

        // Handle Arduino alerts and status updates
        if (message === "ALERT:SYSTEM_READY") {
          addLog("Arduino: SYSTEM_READY received.");
          // Ensure drying state is reset here too, as SYSTEM_READY implies a non-logging state
          resetDryingProcess();
          if (!showSettingsModal && !showFileDownloadModal && (!showDryingModal || dryingModalView === 'options')) {
            setDryingModalView('options');
            setShowDryingModal(true);
            addLog("Arduino requested drying mode selection.");
          } else {
            addLog("Arduino SYSTEM_READY received, but a modal is active or user is already inputting data. Ignoring prompt.");
          }
          return;
        }

        if (message.startsWith("OK:NEW_SESSION_CREATED")) {
          const parts = message.split(':');
          const filename = parts.length > 2 ? parts[2] : 'UNKNOWN_FILE.txt'; 
          const fruitNameFromContext = currentFruit; 
          
          setDryingProcess({
            isDrying: false, // Changed to false - logging hasn't started yet
            currentFilename: filename,
            dryingStartTime: 0, // Reset to 0 until logging starts
            lastDryingDetails: { fruit: fruitNameFromContext, filename: filename } 
          });
          addLog(`Arduino: New session created: ${filename}.`);
          setShowDryingModal(false); // Close the modal now that session is confirmed
          
          // Removed the automatic START command
          return;
        }

        if (message.startsWith("OK:CONTINUED_SESSION")) {
          const parts = message.split(':');
          const filename = parts.length > 2 ? parts[2] : 'UNKNOWN_FILE.txt'; 
          const fruitNameFromContext = currentFruit; 

          setDryingProcess({
            isDrying: false, // Changed to false - logging hasn't started yet
            currentFilename: filename,
            dryingStartTime: 0, // Reset to 0 until logging starts
            lastDryingDetails: { fruit: fruitNameFromContext, filename: filename } 
          });
          addLog(`Arduino: Continued session: ${filename}.`);
          setShowDryingModal(false);
          
          // Removed the automatic START command
          return;
        }
        
        if (message.startsWith("ERROR:")) {
          Alert.alert("Arduino Error", `Arduino reported: ${message}`);
          // Always reset drying process on Arduino error, it indicates a problem with the state
          resetDryingProcess(); 
          setDryingModalView('options'); 
          setShowDryingModal(true); 
          addLog(`Arduino error: ${message}`);
          return;
        }

        if (message === "STATUS:LOGGING_STARTED") {
          setDryingProcess({ isDrying: true, dryingStartTime: Date.now() }); 
          addLog("Arduino: Data logging started.");
          setShowDryingModal(false); 
          return;
        }

        if (message === "STATUS:LOGGING_STOPPED") {
          resetDryingProcess(); 
          addLog("Arduino: Data logging stopped. Drying session concluded.");
          return;
        }

        if (message === "STATUS:SYSTEM_RESET") {
          resetDryingProcess(); 
          addLog("Arduino: System reset. Waiting for next alert.");
          setShowFileDownloadModal(false);
          // Close drying modal if it's open, as system is reset
          setShowDryingModal(false); 
          return;
        }

        if (message === "OK:TARE_COMPLETE") {
          addLog("Arduino: Tare complete.");
          Alert.alert("Tare Complete", "Scale has been tared successfully.");
          return;
        }
        
        if (message.startsWith("ALERT:SD_CARD_ERROR")) {
          Alert.alert("SD Card Error", "SD card not found or unreadable on Arduino. Logging disabled.");
          setDryingProcess({ isDrying: false }); 
          addLog("SD Card Error: Logging stopped.");
          // Reset overall drying process, as logging is compromised
          resetDryingProcess();
          return;
        }

        // Handle sensor data updates
        if (message.startsWith('IN:')) {
          const values = message.substring('IN:'.length).trim().split(',');
          setSystemData(prev => ({
            ...prev,
            sensors: {
              ...prev.sensors,
              IN: { temp: values[0] || '-', hum: values[1] || '-' }
            }
          }));
          return;
        }

        if (message.startsWith('MID:')) {
          const values = message.substring('MID:'.length).trim().split(',');
          setSystemData(prev => ({
            ...prev,
            sensors: {
              ...prev.sensors,
              MID: { temp: values[0] || '-', hum: values[1] || '-' }
            }
          }));
          return;
        }

        if (message.startsWith('OUT:')) {
          const values = message.substring('OUT:'.length).trim().split(',');
          setSystemData(prev => ({
            ...prev,
            sensors: {
              ...prev.sensors,
              OUT: { temp: values[0] || '-', hum: values[1] || '-' }
            }
          }));
          return;
        }

        if (message.startsWith('WEIGHT:')) {
          const weight = message.substring('WEIGHT:'.length).trim();
          setSystemData(prev => ({ ...prev, weight: `${parseFloat(weight).toFixed(1)}g` }));
          return;
        }

        if (message.startsWith('SOLAR:')) {
          const voltage = message.substring('SOLAR:'.length).trim();
          setSystemData(prev => ({ ...prev, solar: `${parseFloat(voltage).toFixed(2)}V` }));
          return;
        }

        if (message.startsWith('POWER:')) {
          const powerStatus = message.substring('POWER:'.length).trim();
          setSystemData(prev => ({ ...prev, power: powerStatus }));
          return;
        }

      });
    }

    return () => {
      if (readSubscription) {
        readSubscription.remove();
      }
    };
  }, [connectedDevice, addLog, parseConfigBuffer, setDryingProcess, resetDryingProcess, showDryingModal, isDrying, showFileDownloadModal, showSettingsModal, currentFruit, dryingModalView, sendCommand]);

  // Function to fetch bonded (paired) Bluetooth devices
  const fetchBondedDevices = async () => {
    if (Platform.OS === 'android' && bluetoothEnabled) {
      try {
        addLog("Fetching bonded devices...");
        const devices = await RNBluetoothClassic.getBondedDevices();
        setBondedDevices(devices);
        addLog(`Found ${devices.length} bonded devices`);
      } catch (error) {
        addLog(`Error fetching bonded devices: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  // Function to request enabling Bluetooth if it's disabled
  const requestEnableBluetooth = async () => {
    if (Platform.OS === 'android' && bluetoothAvailable && !bluetoothEnabled) {
      try {
        await RNBluetoothClassic.requestBluetoothEnabled();
      } catch (error) {
        addLog(`Error enabling Bluetooth: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  // Function to start discovering unpaired Bluetooth devices
  const startDeviceDiscovery = async () => {
    if (Platform.OS === 'android' && bluetoothEnabled && !isDiscovering) {
      try {
        setIsDiscovering(true);
        setDiscoveredDevices([]);
        addLog("Starting discovery...");
        const unpaired = await RNBluetoothClassic.startDiscovery();
        setDiscoveredDevices(unpaired);
        addLog(`Found ${unpaired.length} unpaired devices`);
      } catch (error) {
        addLog(`Discovery error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsDiscovering(false);
      }
    }
  };

  // Function to cancel ongoing Bluetooth device discovery
  const cancelDeviceDiscovery = async () => {
    if (Platform.OS === 'android' && isDiscovering) {
      try {
        await RNBluetoothClassic.cancelDiscovery();
        addLog("Discovery cancelled");
      } catch (error) {
        addLog(`Error cancelling discovery: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsDiscovering(false);
      }
    }
  };

  // Function to pair with a selected Bluetooth device
  const pairDevice = async (device: BluetoothDevice) => {
    if (Platform.OS === 'android' && bluetoothEnabled) {
      try {
        addLog(`Pairing with ${device.name || device.address}...`);
        await RNBluetoothClassic.pairDevice(device.address);
        addLog("Pairing successful");
        fetchBondedDevices(); // Refresh bonded devices list after pairing
      } catch (error) {
        addLog(`Pairing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        Alert.alert("Pairing Failed", `Could not pair with ${device.name || device.address}.`);
      }
    }
  };

  // Function to connect to a selected Bluetooth device
  const connectDevice = async (device: BluetoothDevice) => {
    if (Platform.OS === 'android' && bluetoothEnabled && !connectedDevice) {
      try {
        addLog(`Connecting to ${device.name || device.address}...`);
        await device.connect({ delimiter: '\n' });
        setConnectedDevice(device);
        addLog("Connection successful!");

        // Reset system data and config on new connection
        setSystemData({
          power: '', solar: '', weight: '',
          sensors: { IN: { temp: '', hum: '' }, MID: { temp: '', hum: '' }, OUT: { temp: '', hum: '' } }
        });
        setCurrentConfig(DEFAULT_CONFIG);
        addLog("Connected. Waiting for Arduino startup alert...");
      } catch (error) {
        addLog(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        Alert.alert("Connection Failed", `Could not connect to ${device.name || device.address}.`);
      }
    }
  };

  // Function to disconnect from the currently connected Bluetooth device
  const disconnectDevice = async () => {
    if (Platform.OS === 'android' && connectedDevice) {
      try {
        addLog("Disconnecting...");
        await connectedDevice.disconnect();
        setConnectedDevice(null);
        addLog("Disconnected successfully.");

        // Reset system data, config, and drying process on disconnect
        setSystemData({
          power: '', solar: '', weight: '',
          sensors: { IN: { temp: '', hum: '' }, MID: { temp: '', hum: '' }, OUT: { temp: '', hum: '' } }
        });
        setCurrentConfig(DEFAULT_CONFIG);
        resetDryingProcess(); // Reset drying state on explicit disconnect
        setShowDryingModal(false);
        setShowFileDownloadModal(false);
      } catch (error) {
        addLog(`Disconnect failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        Alert.alert("Disconnect Error", `Failed to disconnect from ${connectedDevice.name || connectedDevice.address}.`);
      }
    }
  };

  // Function to send a manually entered command to the device
  const writeToDevice = async () => {
    if (dataToSend.trim()) {
      try {
        await sendCommand(dataToSend);
        setDataToSend(''); // Clear input after sending
      } catch (error) {
        // Error already handled by sendCommand
      }
    }
  };

  // Function to handle starting the logging process
  const handleStartLogging = async () => {
    if (!connectedDevice) {
      Alert.alert("Not Connected", "Please connect to a device to start logging.");
      return;
    }

    try {
      await sendCommand("START"); // Command to start logging
      addLog("Sent START command to Arduino.");
    } catch (error) {
      addLog(`Failed to send START command: ${error}`);
      Alert.alert("Error", `Failed to start logging: ${error}`);
    }
  };

  // Function to handle stopping the logging process
  const handleStopLogging = async () => {
    if (!connectedDevice) {
      Alert.alert("Not Connected", "Please connect to a device to stop logging.");
      return;
    }

    try {
      await sendCommand("STOP"); // Command to stop logging
      addLog("Sent STOP command to Arduino.");
    } catch (error) {
      addLog(`Failed to send STOP command: ${error}`);
      Alert.alert("Error", `Failed to stop logging: ${error}`);
    }
  };

  return (
    <ScrollView style={commonStyles.outerScrollView} contentContainerStyle={commonStyles.contentContainer}>
      {/* Header with Settings Button */}
      <View style={commonStyles.headerContainer}>
        <Text style={commonStyles.header}>Bluetooth Monitor</Text>
        <TouchableOpacity
          style={commonStyles.settingsButton}
          onPress={() => setShowSettingsModal(true)}
          disabled={!connectedDevice}
        >
          <Text style={commonStyles.settingsButtonText}>Settings</Text>
        </TouchableOpacity>
      </View>

      {/* Display Drying Status if active */}
      {isDrying && currentFruit ? (
        <View style={commonStyles.statusSection}>
          <Text style={commonStyles.statusText}>Drying: {currentFruit} ({currentFilename})</Text>
          <Text style={commonStyles.statusText}>Duration: {dryingDuration}</Text>
        </View>
      ) : null}

      {/* Bluetooth Connection Status */}
      <View style={commonStyles.statusSection}>
        <Text style={commonStyles.statusText}>
          Bluetooth: {bluetoothEnabled ? 'Enabled' : 'Disabled'}
        </Text>
        {connectedDevice && (
          <Text style={commonStyles.statusText}>
            Connected: {connectedDevice.name || connectedDevice.address}
          </Text>
        )}
      </View>

      {/* Bluetooth Control Buttons */}
      {Platform.OS === 'android' && (
        <View style={commonStyles.buttonRow}>
          {!bluetoothEnabled ? (
            <TouchableOpacity style={commonStyles.button} onPress={requestEnableBluetooth}>
              <Text style={commonStyles.buttonText}>Enable Bluetooth</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={commonStyles.button}
                onPress={!isDiscovering ? startDeviceDiscovery : cancelDeviceDiscovery}
              >
                <Text style={commonStyles.buttonText}>
                  {!isDiscovering ? 'Discover Devices' : 'Cancel Discovery'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={commonStyles.button} onPress={fetchBondedDevices}>
                <Text style={commonStyles.buttonText}>Refresh Devices</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Device Lists */}
      {bondedDevices.length > 0 && (
        <View style={commonStyles.deviceList}>
          <Text style={commonStyles.subHeader}>Paired Devices ({bondedDevices.length})</Text>
          <ScrollView style={commonStyles.innerScrollView}>
            {bondedDevices.map(device => (
              <View key={device.address} style={commonStyles.deviceItem}>
                <View>
                  <Text style={commonStyles.deviceName}>{device.name || 'Unnamed Device'}</Text>
                  <Text style={commonStyles.deviceAddress}>{device.address}</Text>
                </View>
                <TouchableOpacity
                  style={[
                    commonStyles.smallButton,
                    connectedDevice?.address === device.address ? commonStyles.connectedButton : commonStyles.connectButton
                  ]}
                  onPress={() => connectedDevice?.address === device.address ? disconnectDevice() : connectDevice(device)}
                >
                  <Text style={commonStyles.smallButtonText}>
                    {connectedDevice?.address === device.address ? 'Disconnect' : 'Connect'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {discoveredDevices.length > 0 && (
        <View style={commonStyles.deviceList}>
          <Text style={commonStyles.subHeader}>Discovered Devices ({discoveredDevices.length})</Text>
          <ScrollView style={commonStyles.innerScrollView}>
            {discoveredDevices.map(device => (
              <View key={device.address} style={commonStyles.deviceItem}>
                <View>
                  <Text style={commonStyles.deviceName}>{device.name || 'Unnamed Device'}</Text>
                  <Text style={commonStyles.deviceAddress}>{device.address}</Text>
                </View>
                <TouchableOpacity
                  style={[commonStyles.smallButton, commonStyles.connectButton]}
                  onPress={() => pairDevice(device)}
                >
                  <Text style={commonStyles.smallButtonText}>Pair</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Start/Stop Logging Buttons */}
      {connectedDevice && (
        <View style={commonStyles.buttonRow}>
          <TouchableOpacity
            style={[commonStyles.button, !isDrying ? {} : commonStyles.warningButton]}
            onPress={handleStartLogging}
            // Removed disabled={isDrying}
          >
            <Text style={commonStyles.buttonText}>Start Logging</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[commonStyles.button, isDrying ? commonStyles.cancelButton : commonStyles.warningButton]}
            onPress={handleStopLogging}
            // Removed disabled={!isDrying}
          >
            <Text style={commonStyles.buttonText}>Stop Logging</Text>
          </TouchableOpacity>
          {/* <TouchableOpacity
            style={[commonStyles.button, { backgroundColor: '#FF9500' }]}
            onPress={() => setShowSettingsModal(true)}
          >
            <Text style={commonStyles.buttonText}>Settings</Text>
          </TouchableOpacity> */}
        </View>
      )}



      {/* System Status */}
      {connectedDevice && (
        <View style={commonStyles.dataSection}>
          <Text style={commonStyles.subHeader}>System Status</Text>
          <View style={commonStyles.table}>
            <View style={[commonStyles.tableRow, commonStyles.tableHeader]}>
              <Text style={commonStyles.tableHeaderCell}>Location</Text>
              <Text style={commonStyles.tableHeaderCell}>Temp (°C)</Text>
              <Text style={commonStyles.tableHeaderCell}>Humidity (%)</Text>
            </View>
            {(Object.keys(systemData.sensors) as Array<keyof typeof systemData.sensors>).map(location => (
              <View key={location} style={commonStyles.tableRow}>
                <Text style={commonStyles.tableCell}>{location}</Text>
                <Text style={commonStyles.tableCell}>{systemData.sensors[location].temp || '-'}</Text>
                <Text style={commonStyles.tableCell}>{systemData.sensors[location].hum || '-'}</Text>
              </View>
            ))}
          </View>
          <Text style={commonStyles.systemInfoText}>Power Source: {systemData.power || '-'}</Text>
          <Text style={commonStyles.systemInfoText}>Solar Voltage: {systemData.solar || '-'}</Text>
          <Text style={commonStyles.systemInfoText}>Weight: {systemData.weight || '-'}</Text>
        </View>
      )}

      {/* Send Command Section */}
      {connectedDevice && (
        <View style={commonStyles.textInputContainer}>
          <Text style={commonStyles.subHeader}>Send Command</Text>
          <TextInput
            style={commonStyles.input}
            value={dataToSend}
            onChangeText={setDataToSend}
            placeholder="Enter command"
          />
          <TouchableOpacity style={commonStyles.button} onPress={writeToDevice}>
            <Text style={commonStyles.buttonText}>Send</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Activity Log */}
      <View style={commonStyles.logContainer}>
        <Text style={commonStyles.subHeader}>Activity Log</Text>
        <ScrollView style={commonStyles.logScrollView}>
          {logMessages.map((msg, index) => (
            <Text key={index} style={commonStyles.logText}>{msg}</Text>
          ))}
        </ScrollView>
      </View>

      {/* Modals */}
      <SettingsModal
        isVisible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        currentConfig={currentConfig}
        connectedDevice={connectedDevice}
        addLog={addLog}
        sendCommand={sendCommand}
        requestConfigUpdate={requestConfigUpdate}
      />

      <DryingModal
        isVisible={showDryingModal}
        onClose={() => setShowDryingModal(false)}
        currentView={dryingModalView}
        setCurrentView={setDryingModalView}
        connectedDevice={connectedDevice}
        addLog={addLog}
        sendCommand={sendCommand}
        onDownloadFilePress={() => {
          setShowDryingModal(false);
          addLog("Requesting file list from Arduino for download.");
          sendCommand("DOWNLOAD_FILE");
        }}
        lastDryingDetails={lastDryingDetails} 
        setDryingProcess={setDryingProcess}
      />

      <FileDownloadModal
        isVisible={showFileDownloadModal}
        onClose={() => {
          setShowFileDownloadModal(false);
          addLog("File Download Modal closed. Waiting for Arduino system ready prompt, if applicable.");
        }}
        connectedDevice={connectedDevice}
        addLog={addLog}
        sendCommand={sendCommand}
        availableFiles={availableFiles}
        fileContentBuffer={fileContentBuffer}
        currentDownloadingFilename={currentDownloadingFilenameRef.current}
        isReceivingFileContent={isReceivingFileContentRef.current}
      />
    </ScrollView>
  );
}