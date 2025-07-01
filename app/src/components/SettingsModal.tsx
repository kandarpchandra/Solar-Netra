import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BluetoothDevice } from 'react-native-bluetooth-classic';
import { settingStyles } from '../styles/styleSetting'; // Import the new settings styles

// Define the type for the configuration data from Arduino
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

interface SettingsModalProps {
  isVisible: boolean;
  onClose: () => void;
  currentConfig: AppConfig;
  connectedDevice: BluetoothDevice | null;
  addLog: (message: string) => void;
  sendCommand: (command: string) => Promise<void>;
  requestConfigUpdate: () => Promise<void>;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isVisible,
  onClose,
  currentConfig,
  connectedDevice,
  addLog,
  sendCommand,
  requestConfigUpdate,
}) => {
  const [localConfig, setLocalConfig] = useState<AppConfig>(currentConfig);

  // Update local config when currentConfig prop changes (e.g., after GETCONFIG response)
  useEffect(() => {
    setLocalConfig(currentConfig);
  }, [currentConfig]);

  const handleInputChange = (key: keyof AppConfig, value: string) => {
    let parsedValue: number | undefined;
    if (key === 'calibration_factor' || key === 'solar_threshold_low' || key === 'solar_threshold_high') {
      parsedValue = parseFloat(value);
    } else {
      parsedValue = parseInt(value, 10);
    }

    setLocalConfig(prev => ({
      ...prev,
      [key]: isNaN(parsedValue) ? undefined : parsedValue,
    }));
  };

  const handleSaveChanges = async () => {
    if (!connectedDevice) {
      Alert.alert("Not Connected", "Please connect to a device to save settings.");
      return;
    }

    addLog("Attempting to save configuration changes to Arduino...");
    // Format commands as SET:KEY:VALUE
    const commands: string[] = [];
    if (localConfig.calibration_factor !== currentConfig.calibration_factor) {
      commands.push(`SET:CALIB:${localConfig.calibration_factor}`);
    }
    if (localConfig.solar_threshold_low !== currentConfig.solar_threshold_low) {
      commands.push(`SET:SOLAR_LOW:${localConfig.solar_threshold_low}`);
    }
    if (localConfig.solar_threshold_high !== currentConfig.solar_threshold_high) {
      commands.push(`SET:SOLAR_HIGH:${localConfig.solar_threshold_high}`);
    }
    if (localConfig.min_dwell_time !== currentConfig.min_dwell_time) {
      commands.push(`SET:DWELL_TIME:${localConfig.min_dwell_time}`);
    }
    if (localConfig.reinit_interval !== currentConfig.reinit_interval) {
      commands.push(`SET:REINIT_INT:${localConfig.reinit_interval}`);
    }
    if (localConfig.sd_log_interval !== currentConfig.sd_log_interval) {
      commands.push(`SET:SD_LOG_INT:${localConfig.sd_log_interval}`);
    }
    if (localConfig.display_interval !== currentConfig.display_interval) {
      commands.push(`SET:DISPLAY_INT:${localConfig.display_interval}`);
    }
    if (localConfig.bluetooth_interval !== currentConfig.bluetooth_interval) {
      commands.push(`SET:BT_INT:${localConfig.bluetooth_interval}`);
    }

    if (commands.length === 0) {
      Alert.alert("No Changes", "No configuration changes detected.");
      onClose();
      return;
    }

    try {
      for (const command of commands) {
        await sendCommand(command);
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between commands
      }
      await sendCommand("SAVECONFIG"); // Command to save to EEPROM
      addLog("Configuration changes sent and SAVECONFIG command issued.");
      Alert.alert("Success", "Settings saved to Arduino.");
      requestConfigUpdate(); // Request updated config from Arduino to sync UI
      onClose();
    } catch (error) {
      addLog(`Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Alert.alert("Error", `Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleTareScale = async () => {
    if (!connectedDevice) {
      Alert.alert("Not Connected", "Please connect to a device to tare the scale.");
      return;
    }
    addLog("Sending Tare command (T) to Arduino...");
    try {
      await sendCommand("T");
      Alert.alert("Tare Sent", "Tare command sent to scale. Waiting for Arduino confirmation.");
      addLog("Tare command sent.");
    } catch (error) {
      addLog(`Failed to send Tare command: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Alert.alert("Error", `Failed to tare scale: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (!isVisible) return null;

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isVisible}
      onRequestClose={onClose}
    >
      <View style={settingStyles.centeredView}>
        <View style={settingStyles.modalView}>
          <Text style={settingStyles.modalTitle}>Arduino Settings</Text>
          <ScrollView style={settingStyles.modalScrollView}>
            <View style={settingStyles.settingItem}>
              <Text style={settingStyles.settingLabel}>Calibration Factor:</Text>
              <TextInput
                style={settingStyles.input}
                keyboardType="numeric"
                value={localConfig.calibration_factor?.toString() || ''}
                onChangeText={(text) => handleInputChange('calibration_factor', text)}
              />
            </View>

            <View style={settingStyles.settingItem}>
              <Text style={settingStyles.settingLabel}>Solar Threshold Low (V):</Text>
              <TextInput
                style={settingStyles.input}
                keyboardType="numeric"
                value={localConfig.solar_threshold_low?.toString() || ''}
                onChangeText={(text) => handleInputChange('solar_threshold_low', text)}
              />
            </View>

            <View style={settingStyles.settingItem}>
              <Text style={settingStyles.settingLabel}>Solar Threshold High (V):</Text>
              <TextInput
                style={settingStyles.input}
                keyboardType="numeric"
                value={localConfig.solar_threshold_high?.toString() || ''}
                onChangeText={(text) => handleInputChange('solar_threshold_high', text)}
              />
            </View>

            <View style={settingStyles.settingItem}>
              <Text style={settingStyles.settingLabel}>Min Dwell Time (ms):</Text>
              <TextInput
                style={settingStyles.input}
                keyboardType="numeric"
                value={localConfig.min_dwell_time?.toString() || ''}
                onChangeText={(text) => handleInputChange('min_dwell_time', text)}
              />
            </View>

            <View style={settingStyles.settingItem}>
              <Text style={settingStyles.settingLabel}>Re-init Interval (ms):</Text>
              <TextInput
                style={settingStyles.input}
                keyboardType="numeric"
                value={localConfig.reinit_interval?.toString() || ''}
                onChangeText={(text) => handleInputChange('reinit_interval', text)}
              />
            </View>

            <View style={settingStyles.settingItem}>
              <Text style={settingStyles.settingLabel}>SD Log Interval (ms):</Text>
              <TextInput
                style={settingStyles.input}
                keyboardType="numeric"
                value={localConfig.sd_log_interval?.toString() || ''}
                onChangeText={(text) => handleInputChange('sd_log_interval', text)}
              />
            </View>

            <View style={settingStyles.settingItem}>
              <Text style={settingStyles.settingLabel}>Display Interval (ms):</Text>
              <TextInput
                style={settingStyles.input}
                keyboardType="numeric"
                value={localConfig.display_interval?.toString() || ''}
                onChangeText={(text) => handleInputChange('display_interval', text)}
              />
            </View>

            <View style={settingStyles.settingItem}>
              <Text style={settingStyles.settingLabel}>Bluetooth Interval (ms):</Text>
              <TextInput
                style={settingStyles.input}
                keyboardType="numeric"
                value={localConfig.bluetooth_interval?.toString() || ''}
                onChangeText={(text) => handleInputChange('bluetooth_interval', text)}
              />
            </View>
          </ScrollView>

          <View style={settingStyles.modalButtonContainer}>
            <TouchableOpacity style={[settingStyles.button, settingStyles.modalCancelButton]} onPress={onClose}>
              <Text style={settingStyles.buttonText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[settingStyles.button, settingStyles.modalSaveButton]} onPress={handleSaveChanges}>
              <Text style={settingStyles.buttonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[settingStyles.button, settingStyles.tareButton, !connectedDevice && settingStyles.tareButtonDisabled]}
            onPress={handleTareScale}
            disabled={!connectedDevice}
          >
            <Text style={settingStyles.buttonText}>Tare Scale (T)</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default SettingsModal;