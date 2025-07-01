import { Platform, StyleSheet } from 'react-native';
// import { Colors } from '../constants/Colors'; // Uncomment if you are using Colors here and ensure path is correct

export const commonStyles = StyleSheet.create({
  outerScrollView: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 30,
  },
  container: {
    flex: 1,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  // 'header' from user's input, also serving as 'title' used elsewhere
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#333',
    flex: 1,
  },
  // 'title' style explicitly needed by some components, mapping to header
  title: {
    fontSize: 28, // Slightly larger than header for main titles
    fontWeight: 'bold',
    color: '#333',
  },
  settingsButton: {
    backgroundColor: '#6c757d',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  settingsButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  statusSection: {
    marginBottom: 16,
  },
  statusText: {
    fontSize: 16,
    marginBottom: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around', // Changed to space-around for better spacing
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  button: {
    backgroundColor: '#3498db',
    padding: 12,
    borderRadius: 8,
    marginVertical: 4,
    width: '48%', // Adjusted width for two buttons per row
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#e74c3c',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  warningButton: {
    backgroundColor: '#FFC107',
  },
  disconnectButton: {
    backgroundColor: '#f44336',
  },
  deviceListsContainer: {
    flexDirection: 'row', // Corrected from 'R' to 'row'
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  deviceList: {
    width: '100%',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 8,
    backgroundColor: 'white',
    // maxHeight: 200, // Keep maxHeight
  },
  innerScrollView: {
    // flexGrow: 1, // This is good, but context might limit it
    maxHeight: 150, // Explicit max height to ensure scrollability
  },
  subHeader: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  deviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10, // Increased vertical padding
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  deviceName: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#333', // Ensure text color is visible
  },
  deviceAddress: {
    color: '#666',
    fontSize: 14,
  },
  smallButton: {
    padding: 8,
    borderRadius: 4,
    minWidth: 80,
    alignItems: 'center',
  },
  connectButton: {
    backgroundColor: '#2ecc71',
  },
  connectedButton: {
    backgroundColor: '#e74c3c',
  },
  smallButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  dataSection: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 16,
    backgroundColor: 'white',
  },
  dataContainer: {
    backgroundColor: '#e0f7fa',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  dataLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#00796b',
  },
  dataValue: {
    fontSize: 16,
    color: '#004d40',
  },
  systemStatus: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#b2dfdb',
    paddingTop: 10,
  },
  table: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    marginBottom: 16,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tableHeader: {
    backgroundColor: '#f5f5f5',
  },
  tableHeaderCell: {
    flex: 1,
    padding: 8,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#333', // Ensure header text is visible
  },
  tableCell: {
    flex: 1,
    padding: 8,
    textAlign: 'center',
    color: '#333', // Ensure cell text is visible
  },
  systemInfo: {
    marginBottom: 16,
  },
  systemInfoText: {
    fontSize: 16,
    marginBottom: 4,
    color: '#333', // Ensure info text is visible
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
    backgroundColor: 'white',
    width: '100%',
    color: '#333', // Ensure input text color
  },
  textInputContainer: {
    marginTop: 20,
  },
  logContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 8,
    backgroundColor: 'white',
    minHeight: 100,
  },
  logScrollView: {
    flex: 1,
  },
  logText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginBottom: 2,
    color: '#333',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
    maxHeight: '80%', // Ensure modal doesn't overflow screen
  },
  modalContent: { // This alias remains for compatibility
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  modalScrollView: {
    width: '100%',
    maxHeight: 400, // Ensure scrollability within modal
    marginBottom: 20,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    width: '100%', // Ensure it takes full width of modal content
  },
  settingLabel: {
    fontSize: 16,
    flex: 2,
    color: '#555',
    marginRight: 10, // Add some space between label and input
  },
  settingInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 8,
    textAlign: 'right',
    fontSize: 15,
    color: '#333', // Ensure input text color
    backgroundColor: '#f8f8f8', // Slightly different background for inputs
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  modalSaveButton: {
    backgroundColor: '#28a745',
  },
  modalCancelButton: {
    backgroundColor: '#6c757d',
  },
  dryingOptionButton: {
    backgroundColor: '#007bff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    width: '80%',
    alignItems: 'center',
  },
  dryingOptionButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  formGroup: {
    marginBottom: 15,
    width: '100%',
  },
  formLabel: {
    fontSize: 16,
    marginBottom: 5,
    color: '#333',
  },
  // downloadProgressContainer: {
  //   alignItems: 'center',
  //   padding: 20,
  // },
  // downloadText: {
  //   fontSize: 16,
  //   marginBottom: 10,
  // },
  downloadProgressText: {
    fontSize: 14,
    color: '#666',
    marginTop: 10,
  },
  downloadProgressContainer: {
    alignItems: 'center',
    padding: 20,
  },
  downloadText: {
    fontSize: 16,
    marginTop: 10,
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  fileItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  fileItemText: {
    fontSize: 16,
  },
});
