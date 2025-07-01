import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BluetoothDevice } from 'react-native-bluetooth-classic';
import { commonStyles } from '../styles/appStyles';
import { DryingState, useDrying } from './DryingProcessContext';

interface DryingModalProps {
  isVisible: boolean;
  onClose: () => void;
  currentView: 'options' | 'new_drying' | 'continued_drying';
  setCurrentView: (view: 'options' | 'new_drying' | 'continued_drying') => void;
  connectedDevice: BluetoothDevice | null;
  addLog: (message: string) => void;
  sendCommand: (command: string) => Promise<void>;
  onDownloadFilePress: () => void;
  lastDryingDetails: { fruit: string; filename: string; } | null;
  setDryingProcess: (state: Partial<DryingState>) => void;
}

const DryingModal: React.FC<DryingModalProps> = ({
  isVisible,
  onClose,
  currentView,
  setCurrentView,
  connectedDevice,
  addLog,
  sendCommand,
  onDownloadFilePress,
  lastDryingDetails,
  setDryingProcess,
}) => {
  const { currentFruit: contextFruit, currentFilename: contextFilename, isDrying } = useDrying();
  
  const [fruitName, setFruitName] = useState('');
  const [dateInput, setDateInput] = useState(new Date().toLocaleDateString('en-CA'));
  const [timeInput, setTimeInput] = useState(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const [continueFilename, setContinueFilename] = useState('');

  // Validation for fruit name input
  const validateFruitName = (name: string) => {
    if (!name.trim()) return "Fruit name is required";
    if (name.length > 20) return "Fruit name too long (max 20 characters)";
    if (!/^[a-zA-Z0-9 _-]+$/.test(name)) return "Invalid characters in fruit name (only letters, numbers, spaces, hyphens, underscores allowed)";
    return null;
  };

  // Handler for starting a new drying session
  const handleStartNewDrying = async () => {
    if (!connectedDevice) {
      Alert.alert('Not Connected', 'Please connect to a Bluetooth device first.');
      return;
    }

    const validationError = validateFruitName(fruitName);
    if (validationError) {
      Alert.alert('Input Error', validationError);
      return;
    }

    const combinedDateTime = new Date(`${dateInput}T${timeInput}`);
    if (isNaN(combinedDateTime.getTime())) {
      Alert.alert('Invalid Date/Time', 'Please enter a valid date and time (YYYY-MM-DD HH:MM:SS).');
      return;
    }

    const year = combinedDateTime.getFullYear();
    const month = (combinedDateTime.getMonth() + 1).toString().padStart(2, '0');
    const day = combinedDateTime.getDate().toString().padStart(2, '0');
    const hour = combinedDateTime.getHours().toString().padStart(2, '0');
    const minute = combinedDateTime.getMinutes().toString().padStart(2, '0');
    const second = combinedDateTime.getSeconds().toString().padStart(2, '0');

    // Command format: NEW_DRYING:fruit_name:DDMMYYYY:HHMMSS
    const command = `NEW_DRYING:${fruitName.trim()}:${day}${month}${year}:${hour}${minute}${second}`;

    addLog(`Attempting to start new drying for: ${fruitName} at ${dateInput} ${timeInput}`);
    addLog(`Sending command: ${command}`);

    try {
      await sendCommand(command);
      addLog('New drying command sent successfully. Waiting for Arduino confirmation and automatic logging start.');
      setDryingProcess({ currentFruit: fruitName.trim() }); // Set fruit name in context immediately
      // Do NOT close modal here. It will close when Arduino sends OK:NEW_SESSION_CREATED.
      Alert.alert('New Drying Initiated', `New drying process command sent for ${fruitName}. Waiting for Arduino confirmation to start logging.`);
    } catch (error) {
      addLog(`Failed to send command: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Alert.alert('Error', `Failed to start new drying: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handler for continuing an existing drying session
  const handleContinueDrying = useCallback(async () => {
    if (!connectedDevice) {
      Alert.alert("Not Connected", "Please connect to a device to continue drying.");
      return;
    }
    // Removed: if (!lastDryingDetails) { ... } as per user request

    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');

    // Command format: CONTINUED_DRYING:DDMMYYYY:HHMMSS (as per Arduino code)
    const command = `CONTINUED_DRYING:${day}${month}${year}:${hours}${minutes}${seconds}`;

    try {
      await sendCommand(command);
      addLog(`Continue drying command sent: ${command}`);
      addLog(`Automatically sent current date/time: ${day}/${month}/${year} ${hours}:${minutes}:${seconds}`);
      
      // Removed: setDryingProcess({ currentFruit: fruitToUse, currentFilename: filenameToUse });
      // The context will be updated only when Arduino sends OK:CONTINUED_SESSION
      Alert.alert("Drying Continue Command Sent", `Sending command to Arduino to continue drying. Waiting for confirmation from Arduino.`);
    } catch (error) {
      addLog(`Error sending continue drying command: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Alert.alert("Error", `Failed to send continue drying command: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [connectedDevice, addLog, sendCommand]); // Removed lastDryingDetails from dependencies


  // Effect to pre-fill continueFilename if lastDryingDetails exists (for display, not logic)
  useEffect(() => {
    if (lastDryingDetails && currentView === 'continued_drying') {
      setContinueFilename(lastDryingDetails.filename);
      setFruitName(lastDryingDetails.fruit);
      addLog(`Pre-filled continue drying display with filename: ${lastDryingDetails.filename}`);
    } else {
      setContinueFilename('');
    }
  }, [lastDryingDetails, currentView, addLog]);

  // Automatically trigger continued drying when view changes to 'continued_drying'
  useEffect(() => {
    // No longer checks lastDryingDetails, sends command regardless
    if (currentView === 'continued_drying' && isVisible && connectedDevice && !isDrying) {
      // Small delay to ensure UI updates, then automatically continue drying
      const timer = setTimeout(() => {
        handleContinueDrying();
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [currentView, isVisible, connectedDevice, isDrying, handleContinueDrying]); // Removed lastDryingDetails from dependencies

  // Handler for stopping the current drying session
  const handleStopDrying = async () => {
    if (!connectedDevice) {
      Alert.alert("Not Connected", "Please connect to a device to stop drying.");
      return;
    }
    if (!isDrying) {
      addLog("Not currently drying. Ignoring STOP command.");
      Alert.alert("Info", "No active drying session to stop.");
      return;
    }

    addLog("Sending STOP command to Arduino to end drying session.");
    try {
      await sendCommand("STOP"); // Send STOP command
      // The `index.tsx` listener will handle the `STATUS:LOGGING_STOPPED` response
      onClose(); // Close the modal
    } catch (error) {
      addLog(`Failed to send STOP command: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Alert.alert("Error", `Failed to stop drying: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handler for closing the modal and resetting view to options
  const handleCloseModal = () => {
    setCurrentView('options');
    onClose();
  };

  if (!isVisible) return null;

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isVisible}
      onRequestClose={handleCloseModal}
    >
      <View style={commonStyles.centeredView}>
        <View style={commonStyles.modalView}>
          {currentView === 'options' && (
            <>
              <Text style={commonStyles.modalTitle}>Select Drying Mode</Text>

              <TouchableOpacity
                style={commonStyles.dryingOptionButton}
                onPress={() => {
                  setCurrentView('new_drying');
                  setFruitName('');
                  setDateInput(new Date().toLocaleDateString('en-CA'));
                  setTimeInput(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
                }}
              >
                <Text style={commonStyles.dryingOptionButtonText}>New Drying</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={commonStyles.dryingOptionButton}
                onPress={() => setCurrentView('continued_drying')}
              >
                <Text style={commonStyles.dryingOptionButtonText}>Continued Drying</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={commonStyles.dryingOptionButton}
                onPress={onDownloadFilePress}
              >
                <Text style={commonStyles.dryingOptionButtonText}>Download File</Text>
              </TouchableOpacity>

              {/* Show Stop Drying button only if a drying process is active */}
              {isDrying && (
                <TouchableOpacity
                  style={[commonStyles.dryingOptionButton, commonStyles.cancelButton]}
                  onPress={handleStopDrying}
                >
                  <Text style={commonStyles.dryingOptionButtonText}>Stop Drying</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[commonStyles.button, commonStyles.modalCancelButton]}
                onPress={handleCloseModal}
              >
                <Text style={commonStyles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {currentView === 'new_drying' && (
            <>
              <Text style={commonStyles.modalTitle}>New Drying Session</Text>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Fruit/Vegetable Name:</Text>
                <TextInput
                  style={commonStyles.input}
                  value={fruitName}
                  onChangeText={setFruitName}
                  placeholder="Enter fruit/vegetable name"
                  maxLength={20}
                />
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Date (YYYY-MM-DD):</Text>
                <TextInput
                  style={commonStyles.input}
                  value={dateInput}
                  onChangeText={setDateInput}
                  placeholder="YYYY-MM-DD"
                  keyboardType="numeric"
                />
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Time (HH:MM:SS):</Text>
                <TextInput
                  style={commonStyles.input}
                  value={timeInput}
                  onChangeText={setTimeInput}
                  placeholder="HH:MM:SS"
                  keyboardType="numeric"
                />
              </View>

              <View style={commonStyles.modalButtonContainer}>
                <TouchableOpacity
                  style={[commonStyles.button, commonStyles.modalCancelButton]}
                  onPress={() => setCurrentView('options')}
                >
                  <Text style={commonStyles.buttonText}>Back</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[commonStyles.button, commonStyles.modalSaveButton]}
                  onPress={handleStartNewDrying}
                >
                  <Text style={commonStyles.buttonText}>Start Drying</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {currentView === 'continued_drying' && (
            <>
              <Text style={commonStyles.modalTitle}>Continue Drying</Text>
              <Text style={commonStyles.systemInfoText}>
                Sending `CONTINUED_DRYING` command with current date and time to Arduino.
              </Text>
              <Text style={commonStyles.systemInfoText}>
                The Arduino will attempt to resume the last session from its EEPROM.
              </Text>
              <Text style={commonStyles.systemInfoText}>
                Waiting for Arduino confirmation or error...
              </Text>
              <TouchableOpacity 
                style={[commonStyles.button, commonStyles.modalCancelButton]}
                onPress={() => setCurrentView('options')}
              >
                <Text style={commonStyles.buttonText}>Back</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

export default DryingModal;