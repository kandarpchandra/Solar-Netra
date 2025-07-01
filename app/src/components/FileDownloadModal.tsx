import * as FileSystem from 'expo-file-system';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle
} from 'react-native';
import { BluetoothDevice } from 'react-native-bluetooth-classic';

interface FileDownloadModalProps {
  isVisible: boolean;
  onClose: () => void;
  connectedDevice: BluetoothDevice | null;
  addLog: (message: string) => void;
  sendCommand: (command: string) => Promise<void>;
  availableFiles: string[];
  fileContentBuffer: string[];
  currentDownloadingFilename: string;
  isReceivingFileContent: boolean;
}

interface CommonStyles {
  modalContainer: ViewStyle;
  modalContent: ViewStyle;
  modalTitle: TextStyle;
  errorText: TextStyle;
  fileList: ViewStyle;
  downloadingContainer: ViewStyle;
  noFilesText: TextStyle;
  fileItem: ViewStyle;
  fileText: TextStyle;
  closeButton: ViewStyle;
  closeButtonText: TextStyle;
}

const FileDownloadModal: React.FC<FileDownloadModalProps> = ({
  isVisible,
  onClose,
  connectedDevice,
  addLog,
  sendCommand,
  availableFiles,
  fileContentBuffer,
  currentDownloadingFilename,
  isReceivingFileContent,
}) => {
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const requestStoragePermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          {
            title: "Storage Permission",
            message: "App needs access to storage to save files",
            buttonPositive: "OK"
          }
        );

        // THESE ARE THE CRITICAL LOGS TO CHECK:
        console.log("Permission request result:", granted);
        addLog(`Storage permission result: ${granted}`);
        // ------------------------------------

        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn('Error requesting storage permission:', err);
        addLog(`Error requesting storage permission: ${err}`);
        return false;
      }
    }
    return true;
  };


  const saveFileToDevice = async (): Promise<void> => {
    if (!currentDownloadingFilename || fileContentBuffer.length === 0) return;

    try {
      const fileContent = fileContentBuffer.join('\n');
      const filePath = `${FileSystem.documentDirectory}${currentDownloadingFilename}`;

      await FileSystem.writeAsStringAsync(filePath, fileContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      addLog(`File saved to device: ${filePath}`);
      Alert.alert("Success", `File saved to:\n${filePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setError(`Failed to save file: ${message}`);
      addLog(`Save error: ${message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadFile = async (filename: string): Promise<void> => {
    if (!connectedDevice) {
      Alert.alert("Not Connected", "Please connect to a device to download files.");
      return;
    }

    const hasPermission = await requestStoragePermission();
    if (!hasPermission) {
      Alert.alert(
        "Permission Denied",
        "Storage permission is required to download files. Please enable it manually in your device's settings.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() } // Requires 'react-native' Linking
        ]
      );
      return;
    }

    setIsDownloading(true);
    setError(null);

    try {
      await sendCommand(`GET_FILE:${filename}`);
    } catch (commandError) {
      const errorMessage = commandError instanceof Error ? commandError.message : 'Unknown error';
      setError(`Download failed: ${errorMessage}`);
      setIsDownloading(false);
    }
  };

  const handleBackToMain = async () => {
    try {
      if (connectedDevice) {
        await sendCommand("BACK");
        addLog("Sent BACK to Arduino, exiting download mode.");
      }
    } catch (error) {
      addLog("Error sending BACK: " + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsDownloading(false);
      setError(null);
      onClose();
    }
  };

  useEffect(() => {
    if (!isReceivingFileContent && isDownloading && fileContentBuffer.length > 0) {
      saveFileToDevice();
    }
  }, [isReceivingFileContent, isDownloading, fileContentBuffer]);

  if (!isVisible) return null;

  return (
    <Modal visible={isVisible} animationType="slide" transparent={true}>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Available Files</Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <ScrollView style={styles.fileList}>
            {isDownloading ? (
              <View style={styles.downloadingContainer}>
                <ActivityIndicator size="large" />
                <Text>Downloading {currentDownloadingFilename}...</Text>
              </View>
            ) : availableFiles.length === 0 ? (
              <Text style={styles.noFilesText}>No files found</Text>
            ) : (
              availableFiles.map((file: string, index: number) => {
                const cleanFile = file.trim();
                if (!cleanFile) return null;

                return (
                  <TouchableOpacity
                    key={index}
                    style={styles.fileItem}
                    onPress={() => handleDownloadFile(cleanFile)}
                    disabled={isDownloading}
                  >
                    <Text style={styles.fileText}>{cleanFile}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          <TouchableOpacity
            style={[styles.closeButton, { backgroundColor: '#FF3B30' }]}
            onPress={handleBackToMain}
          >
            <Text style={styles.closeButtonText}>Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create<CommonStyles>({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  errorText: {
    color: 'red',
    marginBottom: 10,
    textAlign: 'center',
  },
  fileList: {
    maxHeight: 300,
  },
  downloadingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  noFilesText: {
    textAlign: 'center',
    color: 'gray',
    padding: 20,
  },
  fileItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  fileText: {
    fontSize: 16,
  },
  closeButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 5,
    marginTop: 10,
  },
  closeButtonText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default FileDownloadModal;
