import { StyleSheet } from 'react-native';

export const settingStyles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)', // Semi-transparent background
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
    width: '90%', // Occupy more width
    maxHeight: '80%', // Limit height for scrollability
  },
  modalTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 25,
    textAlign: 'center',
  },
  modalScrollView: {
    width: '100%',
    maxHeight: '60%', // Give more space for inputs
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18, // Increased spacing
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#eee', // Subtle separator
  },
  settingLabel: {
    flex: 2,
    fontSize: 16,
    color: '#555',
    fontWeight: '500',
  },
  input: {
    flex: 1,
    height: 45, // Taller input fields
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#f9f9f9', // Light background for input
    marginLeft: 10,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 25,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 25,
    elevation: 2,
    minWidth: 120, // Ensure buttons have a minimum width
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#dc3545', // Red for cancel
  },
  modalSaveButton: {
    backgroundColor: '#28a745', // Green for save
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  // Added for the Tare Scale button
  tareButton: {
    backgroundColor: '#007bff', // Blue color for tare
    marginTop: 20,
    width: '100%', // Make tare button full width
  },
  tareButtonDisabled: {
    backgroundColor: '#a0c7ec', // Lighter blue for disabled
  }
});