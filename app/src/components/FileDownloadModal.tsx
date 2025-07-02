import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle
} from 'react-native';
import { BluetoothDevice } from 'react-native-bluetooth-classic';
import RNFS from 'react-native-fs';

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
  fileInfoText: TextStyle;
  filePathText: TextStyle;
  closeButton: ViewStyle;
  closeButtonText: TextStyle;
  buttonRow: ViewStyle;
  shareButton: ViewStyle;
  shareButtonText: TextStyle;
  progressContainer: ViewStyle;
  progressBar: ViewStyle;
  progressText: TextStyle;
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
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [totalLines, setTotalLines] = useState<number>(0);
  const [receivedLines, setReceivedLines] = useState<number>(0);
  const [lastDownloadedFile, setLastDownloadedFile] = useState<string | null>(null);

  const saveFileToDevice = async (): Promise<void> => {
    if (!currentDownloadingFilename || fileContentBuffer.length === 0) {
      addLog(`Cannot save file: filename=${currentDownloadingFilename}, buffer length=${fileContentBuffer.length}`);
      setIsDownloading(false);
      return;
    }

    const fileName = currentDownloadingFilename
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_');
    const fileContent = fileContentBuffer.join('\n');
    const filePath = `${RNFS.DownloadDirectoryPath}/${fileName}`;

    try {
      // Save to Downloads directory using RNFS
      await RNFS.writeFile(filePath, fileContent, 'utf8');
      addLog(`File saved to Downloads: ${filePath}`);
      setLastDownloadedFile(filePath);
      Alert.alert(
        'Download Complete',
        `File '${fileName}' saved successfully!\n\nPath: ${filePath}`,
        [{ text: 'OK', style: 'default' }]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setError(`Failed to save file: ${message}`);
      addLog(`Save error: ${message}`);
      console.error('File save error:', error);
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setTotalLines(0);
      setReceivedLines(0);
    }
  };

  const shareFile = async (filePath: string): Promise<void> => {
    try {
      const fileName = filePath.split('/').pop() || 'Unknown';
      let fileDetails = `File: ${fileName}\n`;
      fileDetails += `Location: ${filePath}\n`;
      let exists = false;
      let size = 'Unknown';
      let isDirectory = false;
      try {
        const fileInfo = await RNFS.stat(filePath);
        exists = true;
        size = fileInfo.size ? fileInfo.size.toString() : 'Unknown';
        isDirectory = fileInfo.isDirectory();
      } catch (e) {
        exists = false;
      }
      fileDetails += `Exists: ${exists ? 'Yes' : 'No'}\n`;
      if (exists) {
        fileDetails += `Size: ${size} bytes\n`;
        fileDetails += `Type: ${isDirectory ? 'Directory' : 'File'}\n`;
      }
      fileDetails += `\nYou can access this file through your device's file manager.`;
      Alert.alert(
        "File Information", 
        fileDetails,
        [{ text: "OK", style: "default" }]
      );
      addLog(`File info displayed for: ${filePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      addLog(`Share error: ${message}`);
      Alert.alert("Error", `Failed to get file information: ${message}`);
    }
  };

  const handleDownloadFile = async (filename: string): Promise<void> => {
    if (!connectedDevice) {
      Alert.alert("Not Connected", "Please connect to a device to download files.");
      return;
    }

    setIsDownloading(true);
    setError(null);
    setDownloadProgress(0);
    setTotalLines(0);
    setReceivedLines(0);

    try {
      addLog(`Starting download for: ${filename}`);
      await sendCommand(`GET_FILE:${filename}`);
      addLog(`Requested file download: ${filename}`);
    } catch (commandError) {
      const errorMessage = commandError instanceof Error ? commandError.message : 'Unknown error';
      setError(`Download failed: ${errorMessage}`);
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const handleRefreshFileList = async (): Promise<void> => {
    if (!connectedDevice) {
      Alert.alert("Not Connected", "Please connect to a device to refresh file list.");
      return;
    }

    try {
      await sendCommand("DOWNLOAD_FILE");
      addLog("Refreshing file list from Arduino...");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(`Failed to refresh file list: ${errorMessage}`);
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
      setDownloadProgress(0);
      setTotalLines(0);
      setReceivedLines(0);
      onClose();
    }
  };

  // Fix progress bar logic
  useEffect(() => {
    if (isReceivingFileContent && fileContentBuffer.length > 0) {
      const currentLines = fileContentBuffer.length;
      setReceivedLines(currentLines);

      // If you know totalLines, use it; otherwise, just show receivedLines
      const progress = totalLines > 0
        ? Math.min((currentLines / totalLines) * 100, 100)
        : 0;
      setDownloadProgress(progress);

      // Log progress for debugging
      console.log(`Progress update: ${currentLines} lines, ${progress.toFixed(1)}%`);
    }
  }, [isReceivingFileContent, fileContentBuffer, totalLines]);

  useEffect(() => {
    if (!isReceivingFileContent && isDownloading && fileContentBuffer.length > 0) {
      // Set progress to 100% when transfer is complete
      setDownloadProgress(100);
      setReceivedLines(fileContentBuffer.length);
      addLog(`File transfer completed, starting save process...`);
      saveFileToDevice();
    }
  }, [isReceivingFileContent, isDownloading, fileContentBuffer]);

  if (!isVisible) return null;

  return (
    <Modal visible={isVisible} animationType="slide" transparent={true}>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>SD Card Files</Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          {lastDownloadedFile && (
            <View style={styles.downloadingContainer}>
              <Text style={styles.fileInfoText}>Last downloaded: {lastDownloadedFile.split('/').pop()}</Text>
              <Text style={styles.filePathText}>Location: {lastDownloadedFile}</Text>
              <TouchableOpacity
                style={styles.shareButton}
                onPress={() => shareFile(lastDownloadedFile)}
              >
                <Text style={styles.shareButtonText}>View File Info</Text>
              </TouchableOpacity>
            </View>
          )}

          <ScrollView style={styles.fileList}>
            {isDownloading ? (
              <View style={styles.downloadingContainer}>
                <ActivityIndicator size="large" />
                <Text>Downloading {currentDownloadingFilename}...</Text>
                
                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View 
                      style={[
                        styles.progressBar, 
                        { 
                          width: `${downloadProgress}%`,
                          backgroundColor: '#34C759'
                        }
                      ]} 
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {Math.round(downloadProgress)}% ({receivedLines} lines received)
                  </Text>
                </View>
              </View>
            ) : availableFiles.length === 0 ? (
              <View style={styles.downloadingContainer}>
                <Text style={styles.noFilesText}>No files found on SD card</Text>
                <TouchableOpacity
                  style={styles.shareButton}
                  onPress={handleRefreshFileList}
                >
                  <Text style={styles.shareButtonText}>Refresh File List</Text>
                </TouchableOpacity>
              </View>
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

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: '#FF3B30' }]}
              onPress={handleBackToMain}
            >
              <Text style={styles.closeButtonText}>Back to Arduino</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
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
    fontWeight: '500',
  },
  fileInfoText: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  filePathText: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  closeButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 5,
    marginTop: 10,
    flex: 1,
    marginHorizontal: 5,
  },
  closeButtonText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  shareButton: {
    backgroundColor: '#34C759',
    padding: 10,
    borderRadius: 5,
    marginTop: 10,
  },
  shareButtonText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 'bold',
  },
  progressContainer: {
    width: '100%',
    marginTop: 15,
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressText: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
  },
});

export default FileDownloadModal;
