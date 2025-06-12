import React, { useEffect, useState } from 'react';
import { Alert, PermissionsAndroid, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
// Import BluetoothDevice and BluetoothDeviceReadEvent
import RNBluetoothClassic, { BluetoothDevice, BluetoothDeviceReadEvent } from 'react-native-bluetooth-classic';

export default function Page() {
  // Explicitly type the useState hooks to prevent 'never[]' and implicit 'any' errors
  const [bluetoothAvailable, setBluetoothAvailable] = useState<boolean>(false);
  const [bluetoothEnabled, setBluetoothEnabled] = useState<boolean>(false);
  const [bondedDevices, setBondedDevices] = useState<BluetoothDevice[]>([]);
  const [discoveredDevices, setDiscoveredDevices] = useState<BluetoothDevice[]>([]);
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  // connectedDevice can be BluetoothDevice or null
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
  const [dataToSend, setDataToSend] = useState<string>('');
  const [receivedData, setReceivedData] = useState<string[]>([]); // Data received is typically string
  const [logMessages, setLogMessages] = useState<string[]>([]);

  // Function to add messages to the log display
  const addLog = (message: string) => { // Explicitly type 'message' as string
    setLogMessages(prevMessages => [`${new Date().toLocaleTimeString()}: ${message}`, ...prevMessages.slice(0, 50)]);
  };

  // Request Bluetooth permissions for Android
  const requestBluetoothPermissions = async (): Promise<boolean> => { // Explicitly return boolean
    if (Platform.OS === 'android') {
      try {
        addLog("Requesting Bluetooth permissions...");
        // BLUETOOTH_SCAN, BLUETOOTH_CONNECT, and ACCESS_FINE_LOCATION are crucial for Android 12+
        const grantedLocation = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Bluetooth Location Permission",
            message: "This app needs access to your location to discover Bluetooth devices.",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK"
          }
        );
        const grantedBluetoothScan = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          {
            title: "Bluetooth Scan Permission",
            message: "This app needs Bluetooth scan permission to find devices.",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK"
          }
        );
        const grantedBluetoothConnect = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          {
            title: "Bluetooth Connect Permission",
            message: "This app needs Bluetooth connect permission to pair and connect devices.",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK"
          }
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
      } catch (err: unknown) { // Explicitly type 'err' as unknown
        if (err instanceof Error) { // Type guard to access message property
          addLog(`Permission request error: ${err.message}`);
        } else {
          addLog(`An unknown permission error occurred.`);
        }
        console.warn(err);
        return false;
      }
    }
    return true; // Permissions are not needed on iOS in the same way for classic Bluetooth
  };


  // Check initial Bluetooth status and set up listeners
  useEffect(() => {
    const initializeBluetooth = async () => {
      if (Platform.OS === 'android') {
        const permissionsGranted = await requestBluetoothPermissions();
        if (!permissionsGranted) {
          return;
        }
      }

      try {
        const available = await RNBluetoothClassic.isBluetoothAvailable();
        setBluetoothAvailable(available);
        addLog(`Bluetooth available: ${available}`);

        const enabled = await RNBluetoothClassic.isBluetoothEnabled();
        setBluetoothEnabled(enabled);
        addLog(`Bluetooth enabled: ${enabled}`);

        if (enabled) {
          fetchBondedDevices();
        }

        // Set up listeners for Bluetooth state changes
        const enabledListener = RNBluetoothClassic.onBluetoothEnabled(() => {
          setBluetoothEnabled(true);
          addLog("Bluetooth has been ENABLED!");
          fetchBondedDevices();
        });

        const disabledListener = RNBluetoothClassic.onBluetoothDisabled(() => {
          setBluetoothEnabled(false);
          addLog("Bluetooth has been DISABLED!");
          setBondedDevices([]);
          setConnectedDevice(null); // Disconnect if Bluetooth is off
        });

        // The 'onError' listener from RNBluetoothClassic passes an event object which might contain
        // a specific error structure or a generic error message. Assuming event.error.message.
        // If event.error is not defined, this will still be safe due to optional chaining.
        const errorListener = RNBluetoothClassic.onError((event: any) => { // Using 'any' for event here for flexibility with unknown error structures
          // A more robust error handling would inspect `event` structure
          // based on RNBluetoothClassic's documentation for `onError` events.
          // For now, assuming `event.error.message` or `event.message` or just `event.data`.
          let errorMessage = "An unknown error occurred.";
          if (event && event.message) {
            errorMessage = event.message;
          } else if (event && event.error && event.error.message) {
            errorMessage = event.error.message;
          } else if (typeof event === 'string') {
            errorMessage = event;
          } else if (event && event.data) { // Some events might pass data property
            errorMessage = event.data;
          }

          addLog(`Global Error: ${errorMessage}`);
          console.error("RNBluetoothClassic Global Error:", event);
        });

        // Clean up listeners on unmount
        return () => {
          enabledListener.remove();
          disabledListener.remove();
          errorListener.remove();
        };

      } catch (error: unknown) { // Explicitly type 'error' as unknown
        if (error instanceof Error) { // Type guard
          if (Platform.OS === 'ios') {
            addLog(`Bluetooth Classic is not fully supported on iOS. Error: ${error.message}`);
          } else {
            addLog(`Error initializing Bluetooth: ${error.message}`);
          }
        } else {
          addLog(`An unknown error occurred during Bluetooth initialization.`);
        }
        console.error("Error initializing Bluetooth:", error);
      }
    };

    initializeBluetooth();
  }, []); // Run once on component mount

  // Function to fetch bonded devices
  const fetchBondedDevices = async () => {
    if (Platform.OS === 'android' && bluetoothEnabled) {
      try {
        addLog("Fetching bonded devices...");
        const devices: BluetoothDevice[] = await RNBluetoothClassic.getBondedDevices(); // Explicitly type 'devices'
        setBondedDevices(devices);
        addLog(`Found ${devices.length} bonded devices.`);
        devices.forEach(device => addLog(`  - Bonded: ${device.name || 'Unknown'} (${device.address})`));
      } catch (error: unknown) { // Explicitly type 'error' as unknown
        if (error instanceof Error) {
          addLog(`Error fetching bonded devices: ${error.message}`);
        } else {
          addLog(`An unknown error occurred while fetching bonded devices.`);
        }
        console.error("Error fetching bonded devices:", error);
      }
    } else {
      addLog("Bluetooth not enabled or platform not Android for fetching bonded devices.");
    }
  };

  // Function to request Bluetooth to be enabled
  const requestEnableBluetooth = async () => {
    if (Platform.OS === 'android' && bluetoothAvailable && !bluetoothEnabled) {
      try {
        addLog("Requesting Bluetooth to be enabled...");
        await RNBluetoothClassic.requestBluetoothEnabled();
        // The onBluetoothEnabled listener will handle state update after user interaction
      } catch (error: unknown) { // Explicitly type 'error' as unknown
        if (error instanceof Error) {
          addLog(`Error requesting Bluetooth enable: ${error.message}`);
        } else {
          addLog(`An unknown error occurred while requesting Bluetooth enable.`);
        }
        console.error("Error requesting Bluetooth enable:", error);
      }
    } else {
      addLog("Cannot request Bluetooth enable: not Android, not available, or already enabled.");
    }
  };

  // Function to start device discovery
  const startDeviceDiscovery = async () => {
    if (Platform.OS === 'android' && bluetoothEnabled && !isDiscovering) {
      try {
        addLog("Starting device discovery...");
        setIsDiscovering(true);
        setDiscoveredDevices([]); // Clear previous discovered devices

        const unpaired: BluetoothDevice[] = await RNBluetoothClassic.startDiscovery(); // Explicitly type 'unpaired'
        setDiscoveredDevices(unpaired);
        addLog(`Discovery finished. Found ${unpaired.length} unpaired devices.`);
        unpaired.forEach(device => addLog(`  - Discovered: ${device.name || 'Unknown'} (${device.address})`));
      } catch (error: unknown) { // Explicitly type 'error' as unknown
        if (error instanceof Error) {
          addLog(`Error starting discovery: ${error.message}`);
        } else {
          addLog(`An unknown error occurred while starting discovery.`);
        }
        console.error("Error starting discovery:", error);
      } finally {
        setIsDiscovering(false);
      }
    } else {
      addLog("Cannot start discovery: not Android, Bluetooth not enabled, or already discovering.");
    }
  };

  // Function to cancel device discovery
  const cancelDeviceDiscovery = async () => {
    if (Platform.OS === 'android' && isDiscovering) {
      try {
        addLog("Cancelling device discovery...");
        await RNBluetoothClassic.cancelDiscovery();
        addLog("Device discovery cancelled.");
      } catch (error: unknown) { // Explicitly type 'error' as unknown
        if (error instanceof Error) {
          addLog(`Error cancelling discovery: ${error.message}`);
        } else {
          addLog(`An unknown error occurred while cancelling discovery.`);
        }
        console.error("Error cancelling discovery:", error);
      } finally {
        setIsDiscovering(false);
      }
    }
  };

  // Function to pair with a device
  const pairDevice = async (device: BluetoothDevice) => { // Explicitly type 'device'
    if (Platform.OS === 'android' && bluetoothEnabled) {
      try {
        addLog(`Attempting to pair with ${device.name || device.address}...`);
        const pairedDevice = await RNBluetoothClassic.pairDevice(device.address);
        addLog(`Successfully paired with ${pairedDevice.name || pairedDevice.address}`);
        fetchBondedDevices(); // Refresh bonded devices list
      } catch (error: unknown) { // Explicitly type 'error' as unknown
        if (error instanceof Error) {
          addLog(`Failed to pair with ${device.name || device.address}: ${error.message}`);
          Alert.alert("Pairing Failed", `Could not pair with ${device.name || device.address}. ${error.message}`);
        } else {
          addLog(`An unknown error occurred while pairing with ${device.name || device.address}.`);
          Alert.alert("Pairing Failed", `An unknown error occurred while pairing with ${device.name || device.address}.`);
        }
        console.error("Pairing error:", error);
      }
    }
  };

  // Function to connect to a device
  const connectDevice = async (device: BluetoothDevice) => { // Explicitly type 'device'
    if (Platform.OS === 'android' && bluetoothEnabled && !connectedDevice) {
      try {
        addLog(`Attempting to connect to ${device.name || device.address}...`);
        // FIX 1: device.connect() returns a boolean or void, not the BluetoothDevice object itself.
        // If successful, we assume the 'device' object itself is now the connected one.
        await device.connect({ delimiter: '\n' }); // No casting needed here, just await the operation
        setConnectedDevice(device); // Set the connected device to the 'device' object passed in
        addLog(`Successfully connected to ${device.name || device.address}`); // Use 'device' object for info

        // FIX 2: onDataReceived expects BluetoothDeviceReadEvent
        // We're listening on the 'device' object directly, which is now connected
        device.onDataReceived((event: BluetoothDeviceReadEvent) => { // Explicitly type 'event'
          addLog(`Received data from ${event.device.name || event.device.address}: ${event.data}`);
          setReceivedData(prevData => [...prevData, event.data]);
        });
      } catch (error: unknown) { // Explicitly type 'error' as unknown
        if (error instanceof Error) {
          addLog(`Failed to connect to ${device.name || device.address}: ${error.message}`);
          Alert.alert("Connection Failed", `Could not connect to ${device.name || device.address}. ${error.message}`);
        } else {
          addLog(`An unknown error occurred while connecting to ${device.name || device.address}.`);
          Alert.alert("Connection Failed", `An unknown error occurred while connecting to ${device.name || device.address}.`);
        }
        console.error("Connection error:", error);
      }
    } else {
      addLog("Cannot connect: not Android, Bluetooth not enabled, or already connected.");
    }
  };

  // Function to disconnect from the currently connected device
  const disconnectDevice = async () => {
    if (Platform.OS === 'android' && connectedDevice) {
      try {
        addLog(`Attempting to disconnect from ${connectedDevice.name || connectedDevice.address}...`);
        await connectedDevice.disconnect(); // Correctly call disconnect on the BluetoothDevice object
        setConnectedDevice(null);
        setReceivedData([]); // Clear received data on disconnect
        addLog(`Successfully disconnected from ${connectedDevice.name || connectedDevice.address}`);
      } catch (error: unknown) { // Explicitly type 'error' as unknown
        if (error instanceof Error) {
          addLog(`Failed to disconnect from ${connectedDevice.name || connectedDevice.address}: ${error.message}`);
          Alert.alert("Disconnect Failed", `Could not disconnect from ${connectedDevice.name || connectedDevice.address}. ${error.message}`);
        } else {
          addLog(`An unknown error occurred while disconnecting from ${connectedDevice.name || connectedDevice.address}.`);
          Alert.alert("Disconnect Failed", `An unknown error occurred while disconnecting from ${connectedDevice.name || connectedDevice.address}.`);
        }
        console.error("Disconnect error:", error);
      }
    } else {
      addLog("No device is currently connected to disconnect.");
    }
  };

  // Function to write data to the connected device
  const writeToDevice = async () => {
    if (Platform.OS === 'android' && connectedDevice && dataToSend.trim() !== '') {
      try {
        addLog(`Sending data: "${dataToSend}" to ${connectedDevice.name || connectedDevice.address}`);
        await connectedDevice.write(dataToSend + '\n'); // Add newline delimiter for HC-05
        setDataToSend(''); // Clear input after sending
      } catch (error: unknown) { // Explicitly type 'error' as unknown
        if (error instanceof Error) {
          addLog(`Failed to send data: ${error.message}`);
          Alert.alert("Send Data Failed", `Could not send data. ${error.message}`);
        } else {
          addLog(`An unknown error occurred while sending data.`);
          Alert.alert("Send Data Failed", `An unknown error occurred while sending data.`);
        }
        console.error("Write data error:", error);
      }
    } else if (!connectedDevice) {
      addLog("No device connected to send data.");
      Alert.alert("No Connection", "Please connect to a device first.");
    } else if (dataToSend.trim() === '') {
      addLog("No data to send.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>RN Bluetooth Classic Demo</Text>

      <View style={styles.statusSection}>
        <Text style={styles.statusText}>Bluetooth Available: <Text style={{ fontWeight: 'bold', color: bluetoothAvailable ? 'green' : 'red' }}>{bluetoothAvailable ? 'Yes' : 'No'}</Text></Text>
        <Text style={styles.statusText}>Bluetooth Enabled: <Text style={{ fontWeight: 'bold', color: bluetoothEnabled ? 'green' : 'red' }}>{bluetoothEnabled ? 'Yes' : 'No'}</Text></Text>
        {connectedDevice && (
          <Text style={styles.statusText}>Connected To: <Text style={{ fontWeight: 'bold', color: 'blue' }}>{connectedDevice.name || connectedDevice.address}</Text></Text>
        )}
      </View>

      {Platform.OS === 'android' && bluetoothAvailable && (
        <View style={styles.buttonRow}>
          {!bluetoothEnabled && (
            <TouchableOpacity style={styles.button} onPress={requestEnableBluetooth}>
              <Text style={styles.buttonText}>Enable Bluetooth</Text>
            </TouchableOpacity>
          )}
          {bluetoothEnabled && (
            <>
              {!isDiscovering ? (
                <TouchableOpacity style={styles.button} onPress={startDeviceDiscovery}>
                  <Text style={styles.buttonText}>Discover Devices</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={cancelDeviceDiscovery}>
                  <Text style={styles.buttonText}>Cancel Discovery</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.button} onPress={fetchBondedDevices}>
                <Text style={styles.buttonText}>Refresh Bonded</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {Platform.OS === 'android' ? (
        <>
          <View style={styles.deviceList}>
            <Text style={styles.subHeader}>Bonded Devices ({bondedDevices.length}):</Text>
            {bondedDevices.length > 0 ? (
              <ScrollView style={styles.scrollView}>
                {bondedDevices.map((device) => (
                  <View key={device.address} style={styles.deviceItem}>
                    <View>
                      <Text style={styles.deviceName}>{device.name || 'Unknown Device'}</Text>
                      <Text style={styles.deviceAddress}>{device.address}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.smallButton, connectedDevice?.address === device.address ? styles.connectedButton : styles.connectButton]}
                      onPress={() => connectedDevice?.address === device.address ? disconnectDevice() : connectDevice(device)}
                      disabled={!bluetoothEnabled}
                    >
                      <Text style={styles.smallButtonText}>
                        {connectedDevice?.address === device.address ? 'Disconnect' : 'Connect'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.noDevicesText}>No bonded devices found. Pair a device or start discovery.</Text>
            )}
          </View>

          {discoveredDevices.length > 0 && (
            <View style={styles.deviceList}>
              <Text style={styles.subHeader}>Discovered Devices ({discoveredDevices.length}):</Text>
              <ScrollView style={styles.scrollView}>
                {discoveredDevices.map((device) => (
                  <View key={device.address} style={styles.deviceItem}>
                    <View>
                      <Text style={styles.deviceName}>{device.name || 'Unknown Device'}</Text>
                      <Text style={styles.deviceAddress}>{device.address}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.smallButton}
                      onPress={() => pairDevice(device)}
                      disabled={!bluetoothEnabled}
                    >
                      <Text style={styles.smallButtonText}>Pair</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {connectedDevice && (
            <View style={styles.dataSection}>
              <Text style={styles.subHeader}>Send Data:</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter data to send"
                value={dataToSend}
                onChangeText={setDataToSend}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={styles.button} onPress={writeToDevice}>
                <Text style={styles.buttonText}>Send to Device</Text>
              </TouchableOpacity>

              <Text style={styles.subHeader}>Received Data:</Text>
              <ScrollView style={styles.receivedDataScrollView}>
                {receivedData.length > 0 ? (
                  receivedData.map((data, index) => (
                    <Text key={index} style={styles.receivedDataItem}>{data}</Text>
                  ))
                ) : (
                  <Text style={styles.noDataText}>No data received yet.</Text>
                )}
              </ScrollView>
            </View>
          )}
        </>
      ) : (
        <Text style={styles.iosMessage}>Bluetooth Classic features are primarily for Android and HC-05 connections. Many `RNBluetoothClassic` functions are not supported for generic Bluetooth Classic devices on iOS.</Text>
      )}

      <View style={styles.logContainer}>
        <Text style={styles.subHeader}>Activity Log:</Text>
        <ScrollView style={styles.logScrollView}>
          {logMessages.map((msg, index) => (
            <Text key={index} style={styles.logText}>{msg}</Text>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f8',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 20,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#2c3e50',
  },
  statusSection: {
    marginBottom: 20,
    alignItems: 'flex-start',
    width: '100%',
    paddingLeft: 10,
  },
  statusText: {
    fontSize: 18,
    marginBottom: 5,
    color: '#34495e',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#3498db',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginVertical: 5,
    minWidth: 150,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cancelButton: {
    backgroundColor: '#e74c3c',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  deviceList: {
    flex: 2,
    width: '100%',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
    maxHeight: 200, // Limit height for scrollable lists
  },
  subHeader: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 10,
    color: '#2c3e50',
  },
  scrollView: {
    flex: 1,
  },
  deviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ecf0f1',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  deviceAddress: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  smallButton: {
    backgroundColor: '#2ecc71',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 10,
  },
  connectButton: {
    backgroundColor: '#3498db',
  },
  connectedButton: {
    backgroundColor: '#e74c3c', // Red for disconnect when connected
  },
  smallButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  noDevicesText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#7f8c8d',
    fontStyle: 'italic',
  },
  dataSection: {
    width: '100%',
    marginTop: 20,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#bdc3c7',
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
    fontSize: 16,
  },
  receivedDataScrollView: {
    maxHeight: 150,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 5,
    padding: 10,
    backgroundColor: '#f9f9f9',
  },
  receivedDataItem: {
    fontSize: 14,
    marginBottom: 5,
    color: '#2c3e50',
    fontFamily: 'monospace',
  },
  noDataText: {
    textAlign: 'center',
    color: '#7f8c8d',
    fontStyle: 'italic',
  },
  iosMessage: {
    fontSize: 16,
    color: '#c0392b',
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
    fontStyle: 'italic',
  },
  logContainer: {
    flex: 1,
    width: '100%',
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
    maxHeight: 150, // Limit log height
  },
  logScrollView: {
    flex: 1,
  },
  logText: {
    fontSize: 12,
    color: '#34495e',
    marginBottom: 2,
    fontFamily: 'monospace',
  },
});
