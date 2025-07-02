#include <DHT.h>
#include "HX711.h"
#include <SoftwareSerial.h>
#include <SPI.h>
#include <SdFat.h> // Replaced <SD.h> with <SdFat.h>
#include <EEPROM.h>

// --- Bluetooth Module Setup ---
#define BT_RX_PIN 65
#define BT_TX_PIN 64
SoftwareSerial bluetooth(BT_RX_PIN, BT_TX_PIN);

// DHT Sensor Pins & Setup
#define DHTPIN_INSIDE   3
#define DHTPIN_MIDDLE   4
#define DHTPIN_OUTSIDE  5
#define DHTTYPE DHT22

DHT dhtInside(DHTPIN_INSIDE, DHTTYPE);
DHT dhtMiddle(DHTPIN_MIDDLE, DHTTYPE);
DHT dhtOutside(DHTPIN_OUTSIDE, DHTTYPE);

// Sensor availability flags
bool dhtInside_available = false;
bool dhtMiddle_available = false;
bool dhtOutside_available = false;

// Timing and reinitialization
unsigned long lastReinitAttempt = 0;
unsigned long loopCounter = 0; // Not used in current code, can be removed if not planned for future use

// Relay and Weight Sensor
const int RELAY_POWER = 2;
#define LOADCELL_DOUT_PIN 9
#define LOADCELL_SCK_PIN 6
HX711 scale;

// Solar Voltage Measurement
const int SOLAR_VOLTAGE_PIN = A0;
const float R1 = 18000.0;
const float R2 = 4700.0;

// Power switching timers
unsigned long solarGoodStartTime = 0;
unsigned long solarBadStartTime = 0;

// Configurable parameters
float calibration_factor = 1071.5;
float solar_threshold_low = 5.0;
float solar_threshold_high = 13.0;
unsigned long min_dwell_time = 5000;
unsigned long reinit_interval = 60000;
unsigned long sd_log_interval = 2000;
unsigned long display_interval = 5000;
unsigned long bluetooth_interval = 5000;
unsigned long alert_interval = 5000;

// System state
#define SOLAR_POWER_ACTIVE LOW
#define AC_POWER_ACTIVE HIGH
bool usingSolar = true;
bool sdCardAvailable = false;

// SD Card Setup
#define SD_CS_PIN 53
SdFat sd; // SdFat object for SD card operations
SdFile dataFile; // Global SdFile object for data logging - will be kept open during logging

// Timing variables
unsigned long lastLogTime = 0;
unsigned long lastPrintTime = 0;
unsigned long lastBluetoothTime = 0;
unsigned long lastAlertTime = 0;

// System states
enum SystemState {
  WAITING_FOR_COMMAND,
  LOGGING_DATA,
  DOWNLOADING_FILE
};

SystemState currentState = WAITING_FOR_COMMAND;

#define MAX_FILENAME_LENGTH 32


// Current session data
char currentFileNameBuffer[MAX_FILENAME_LENGTH] = ""; 
String currentFruit = "";    // Not directly used in file operations, but good for context
String sessionStartTime = ""; // For initial time stamp, not strictly for internal logging
bool isLogging = false;
unsigned long sessionStartMillis = 0; // Time when logging actually started for current session

// EEPROM Configuration Structure
struct Config {
  float calibration_factor;
  float solar_threshold_low;
  float solar_threshold_high;
  unsigned long min_dwell_time;
  unsigned long reinit_interval;
  unsigned long sd_log_interval;
  unsigned long display_interval;
  unsigned long bluetooth_interval;
};

#define FILENAME_EEPROM_ADDR sizeof(Config)  // Address right after config
#define MAX_FILENAME_EEPROM_LENGTH 32 

// Add these near the top of your code with other constants
#define SECONDS_PER_MINUTE 60
#define SECONDS_PER_HOUR 3600
#define SECONDS_PER_DAY 86400

// Structure to hold parsed initial datetime
struct SessionDateTime {
    int day;
    int month;
    int year;
    int hour;
    int minute;
    int second;
};

// Global variable to store initial datetime
SessionDateTime initialDateTime;

// Global buffer for incoming Bluetooth commands
#define BT_CMD_BUFFER_SIZE 128
char btCmdBuffer[BT_CMD_BUFFER_SIZE];
byte btCmdBufferIndex = 0;

// Function prototypes
void sendAlert();
void handleNewDrying(String command);
void handleContinuedDrying(String command);
void handleDownloadFile();
void listSDFiles();
void sendFileContent(String filename);
void createNewFile(String fruit, String datetime);
void performTare();
void startLogging(); // Adjusted for new file handling
void stopLogging();  // Adjusted for new file handling
void softReset();    // Adjusted for new file handling

int freeRam() {
  extern int __heap_start, *__brkval;
  int v;
  return (int) &v - (__brkval == 0 ? (int) &__heap_start : (int) __brkval);
}

void saveConfig() {
  Config currentConfig = {
    calibration_factor,
    solar_threshold_low,
    solar_threshold_high,
    min_dwell_time,
    reinit_interval,
    sd_log_interval,
    display_interval,
    bluetooth_interval
  };
  EEPROM.put(0, currentConfig);
}

void loadConfig() {
  Config loadedConfig;
  EEPROM.get(0, loadedConfig);

  // Basic validation to prevent loading garbage values
  if (loadedConfig.calibration_factor > 0.0 && loadedConfig.calibration_factor < 20000.0) {
    calibration_factor = loadedConfig.calibration_factor;
  }
  if (loadedConfig.solar_threshold_low >= 0.0 && loadedConfig.solar_threshold_low < 50.0) {
    solar_threshold_low = loadedConfig.solar_threshold_low;
  }
  if (loadedConfig.solar_threshold_high > loadedConfig.solar_threshold_low && loadedConfig.solar_threshold_high < 50.0) {
    solar_threshold_high = loadedConfig.solar_threshold_high;
  }
  if (loadedConfig.min_dwell_time > 0 && loadedConfig.min_dwell_time < 600000) {
    min_dwell_time = loadedConfig.min_dwell_time;
  }
  if (loadedConfig.reinit_interval > 0 && loadedConfig.reinit_interval < 3600000) {
    reinit_interval = loadedConfig.reinit_interval;
  }
  if (loadedConfig.sd_log_interval > 0 && loadedConfig.sd_log_interval < 3600000) {
    sd_log_interval = loadedConfig.sd_log_interval;
  }
  if (loadedConfig.display_interval > 0 && loadedConfig.display_interval < 60000) {
    display_interval = loadedConfig.display_interval;
  }
  if (loadedConfig.bluetooth_interval > 0 && loadedConfig.bluetooth_interval < 60000) {
    bluetooth_interval = loadedConfig.bluetooth_interval;
  }
}

void handleConfigCommand(String command) {
  if (command.startsWith("GETCONFIG")) {
    bluetooth.println(F("CONFIG:START"));
    bluetooth.print(F("CONFIG:CALIB:")); bluetooth.println(calibration_factor);
    bluetooth.print(F("CONFIG:SOLAR_LOW:")); bluetooth.println(solar_threshold_low);
    bluetooth.print(F("CONFIG:SOLAR_HIGH:")); bluetooth.println(solar_threshold_high);
    bluetooth.print(F("CONFIG:DWELL_TIME:")); bluetooth.println(min_dwell_time);
    bluetooth.print(F("CONFIG:REINIT_INT:")); bluetooth.println(reinit_interval);
    bluetooth.print(F("CONFIG:SD_LOG_INT:")); bluetooth.println(sd_log_interval);
    bluetooth.print(F("CONFIG:DISPLAY_INT:")); bluetooth.println(display_interval);
    bluetooth.print(F("CONFIG:BT_INT:")); bluetooth.println(bluetooth_interval);
    bluetooth.println(F("CONFIG:END"));
  } else if (command.startsWith("SET:")) {
    handleSetCommand(command);
  } else if (command == "SAVECONFIG") {
    saveConfig();
    bluetooth.println(F("OK:CONFIG_SAVED"));
  }
}

void handleSetCommand(String command) {
  int firstColon = command.indexOf(':', 4); // After "SET:"
  if (firstColon == -1) return;
  
  String key = command.substring(4, firstColon);
  float value = command.substring(firstColon + 1).toFloat();
  
  if (key == "CALIB") calibration_factor = value;
  else if (key == "SOLAR_LOW") solar_threshold_low = value;
  else if (key == "SOLAR_HIGH") solar_threshold_high = value;
  else if (key == "DWELL_TIME") min_dwell_time = (unsigned long)value;
  else if (key == "REINIT_INT") reinit_interval = (unsigned long)value;
  else if (key == "SD_LOG_INT") sd_log_interval = (unsigned long)value;
  else if (key == "DISPLAY_INT") display_interval = (unsigned long)value;
  else if (key == "BT_INT") bluetooth_interval = (unsigned long)value;
  
  bluetooth.println(F("OK:SETTING_UPDATED"));
}


void saveLastFilenameToEEPROM(const char* filename) {
  // Write each character including null terminator
  for (int i = 0; i < MAX_FILENAME_EEPROM_LENGTH; i++) {
    EEPROM.write(FILENAME_EEPROM_ADDR + i, filename[i]);
    if (filename[i] == '\0') break; // Stop at null terminator
  }
}

void loadLastFilenameFromEEPROM(char* buffer) {
  for (int i = 0; i < MAX_FILENAME_EEPROM_LENGTH; i++) {
    buffer[i] = EEPROM.read(FILENAME_EEPROM_ADDR + i);
    if (buffer[i] == '\0') break; // Stop at null terminator
  }
}

// Function to parse the initial datetime string (DDMMYYYY_HHMMSS)
bool parseInitialDateTime(String datetimeStr, SessionDateTime &result) {
    if (datetimeStr.length() != 15) return false; // DDMMYYYY_HHMMSS = 8+1+6=15 chars
    
    // Parse date (DDMMYYYY)
    result.day = datetimeStr.substring(0, 2).toInt();
    result.month = datetimeStr.substring(2, 4).toInt();
    result.year = datetimeStr.substring(4, 8).toInt();
    
    // Parse time (HHMMSS)
    result.hour = datetimeStr.substring(9, 11).toInt();
    result.minute = datetimeStr.substring(11, 13).toInt();
    result.second = datetimeStr.substring(13, 15).toInt();
    
    // Basic validation
    if (result.day < 1 || result.day > 31) return false;
    if (result.month < 1 || result.month > 12) return false;
    if (result.hour < 0 || result.hour > 23) return false;
    if (result.minute < 0 || result.minute > 59) return false;
    if (result.second < 0 || result.second > 59) return false;
    
    return true;
}

// Function to calculate current datetime based on elapsed seconds
void calculateCurrentDateTime(unsigned long elapsedSeconds, SessionDateTime &result) {
    // Start with initial datetime
    result = initialDateTime;
    
    // Add seconds
    result.second += elapsedSeconds % 60;
    elapsedSeconds /= 60; // Convert to minutes
    
    // Handle second overflow
    if (result.second >= 60) {
        result.second -= 60;
        result.minute++;
    }
    
    // Add minutes
    result.minute += elapsedSeconds % 60;
    elapsedSeconds /= 60; // Convert to hours
    
    // Handle minute overflow
    if (result.minute >= 60) {
        result.minute -= 60;
        result.hour++;
    }
    
    // Add hours
    result.hour += elapsedSeconds % 24;
    elapsedSeconds /= 24; // Convert to days
    
    // Handle hour overflow
    if (result.hour >= 24) {
        result.hour -= 24;
        result.day++;
    }
    
    // Add days (this is simplified - doesn't handle month lengths or leap years)
    result.day += elapsedSeconds;
    
    // Handle day overflow (simplified month handling)
    while (result.day > daysInMonth(result.month, result.year)) {
        result.day -= daysInMonth(result.month, result.year);
        result.month++;
        if (result.month > 12) {
            result.month = 1;
            result.year++;
        }
    }
}

// Helper function to get days in month (simplified, doesn't account for leap years)
int daysInMonth(int month, int year) {
    if (month == 2) {
        return (year % 4 == 0) ? 29 : 28; // Simple leap year check
    } else if (month == 4 || month == 6 || month == 9 || month == 11) {
        return 30;
    } else {
        return 31;
    }
}

// Function to format datetime as string
String formatDateTime(const SessionDateTime &dt, unsigned long millisPart) {
    char buffer[24];
    snprintf(buffer, sizeof(buffer), "%04d-%02d-%02d %02d:%02d:%02d.%03d",
             dt.year, dt.month, dt.day,
             dt.hour, dt.minute, dt.second,
             (int)(millisPart % 1000));
    return String(buffer);
}

void initializeDHTSensor(DHT &sensor, const char* name, bool &available) {
  Serial.print(F("Initializing "));
  Serial.print(name);
  Serial.print(F(" DHT..."));

  sensor.begin();
  unsigned long startTime = millis();
  bool connected = false;
  while (millis() - startTime < 3000) { // Try for 3 seconds
    float t = sensor.readTemperature();
    float h = sensor.readHumidity();
    if (!isnan(t) && !isnan(h) && t > -50.0 && t < 150.0 && h >= 0.0 && h <= 100.0) {
      connected = true;
      break;
    }
    delay(200);
  }
  available = connected;
  if (connected) {
    Serial.println(F("OK"));
  } else {
    Serial.println(F("FAILED"));
  }
}

float readDHTTemperature(DHT &sensor, bool &available) {
  if (!available) return -99.0;
  float t = sensor.readTemperature();
  if (isnan(t) || t < -50.0 || t > 150.0) { // Check for valid range
    available = false; // Mark as unavailable if reading is out of bounds
    return -99.0;
  }
  return t;
}

float readDHTHumidity(DHT &sensor, bool &available) {
  if (!available) return -99.0;
  float h = sensor.readHumidity();
  if (isnan(h) || h < 0.0 || h > 100.0) { // Check for valid range
    available = false; // Mark as unavailable if reading is out of bounds
    return -99.0;
  }
  return h;
}

void handlePowerSwitching(float solarVoltage, unsigned long currentMillis) {
  if (solarVoltage >= solar_threshold_high) {
    if (digitalRead(RELAY_POWER) != SOLAR_POWER_ACTIVE) {
      if (solarGoodStartTime == 0) {
        solarGoodStartTime = currentMillis;
        solarBadStartTime = 0; // Reset bad timer
      } else if (currentMillis - solarGoodStartTime >= min_dwell_time) {
        digitalWrite(RELAY_POWER, SOLAR_POWER_ACTIVE);
        usingSolar = true;
        solarGoodStartTime = 0; // Reset timer after switching
        Serial.println(F("Switched to SOLAR"));
        if (isLogging) bluetooth.println(F("Switched to SOLAR")); // Send immediate update to BT
      }
    }
    solarBadStartTime = 0; // Reset bad timer if conditions are good
  }
  else if (solarVoltage < solar_threshold_low) {
    if (digitalRead(RELAY_POWER) != AC_POWER_ACTIVE) {
      if (solarBadStartTime == 0) {
        solarBadStartTime = currentMillis;
        solarGoodStartTime = 0; // Reset good timer
      } else if (currentMillis - solarBadStartTime >= min_dwell_time) {
        digitalWrite(RELAY_POWER, AC_POWER_ACTIVE);
        usingSolar = false;
        solarBadStartTime = 0; // Reset timer after switching
        Serial.println(F("Switched to AC"));
        if (isLogging) bluetooth.println(F("Switched to AC")); // Send immediate update to BT
      }
    }
    solarGoodStartTime = 0; // Reset good timer if conditions are bad
  } else {
    // If voltage is between low and high thresholds, reset both timers
    solarGoodStartTime = 0;
    solarBadStartTime = 0;
  }
}

void sendAlert() {
  bluetooth.println(F("ALERT:SYSTEM_READY"));
  bluetooth.println(F("OPTIONS:NEW_DRYING,CONTINUED_DRYING,DOWNLOAD_FILE"));
  Serial.println(F("Alert sent - waiting for command"));
}

void handleNewDrying(String command) {
  // Expected format: NEW_DRYING:fruit_name:DDMMYYYY:HHMMSS
  int firstColon = command.indexOf(':', 11); // After "NEW_DRYING:" (length of "NEW_DRYING:")
  int secondColon = command.indexOf(':', firstColon + 1);

  if (firstColon == -1 || secondColon == -1) {
    bluetooth.println(F("ERROR:Invalid format"));
    return;
  }

  String fruit = command.substring(11, firstColon);
  String date = command.substring(firstColon + 1, secondColon);
  String time = command.substring(secondColon + 1);

  String datetimeStr = date + "_" + time;
    
  // Parse initial datetime
  if (!parseInitialDateTime(datetimeStr, initialDateTime)) {
    bluetooth.println(F("ERROR:Invalid datetime format"));
    return;
  }

  currentFruit = fruit;
  sessionStartTime = date + "_" + time; // This is primarily for display/context
  sessionStartMillis = millis(); // Reset session timer

  createNewFile(fruit, date + "_" + time); // This function now opens the file and sets isLogging
  
  if (dataFile.isOpen()) { // Check if createNewFile was successful in starting logging
    performTare(); // Tare only after file is ready and logging is assumed to start
    currentState = LOGGING_DATA;
    bluetooth.print(F("OK:NEW_SESSION_CREATED:"));
    bluetooth.println(currentFileNameBuffer);
    bluetooth.println(F("STATUS:READY_TO_START")); // This might be redundant if isLogging is set in createNewFile
    Serial.println(F("New session created. Waiting for START command."));
  } else {
    bluetooth.println(F("ERROR:Failed to setup new drying session."));
    Serial.println(F("Failed to setup new drying session, createNewFile issue."));
    softReset(); // Go back to waiting state
  }
}

void handleContinuedDrying(String command) {
    // Expected format: CONTINUED_DRYING:DDMMYYYY:HHMMSS
    int firstColonIdx = command.indexOf(':'); 
    if (firstColonIdx == -1) {
        bluetooth.println(F("ERROR:Invalid command format (missing first colon)"));
        return;
    }

    int secondColonIdx = command.indexOf(':', firstColonIdx + 1); 
    if (secondColonIdx == -1) {
        bluetooth.println(F("ERROR:Invalid command format (missing second colon)"));
        return;
    }

    String date = command.substring(firstColonIdx + 1, secondColonIdx);
    String time = command.substring(secondColonIdx + 1);
    String datetimeStr = date + "_" + time;
    
    // --- Add these lines for debugging ---
    Serial.print(F("Debug: date = "));
    Serial.println(date);
    Serial.print(F("Debug: time = "));
    Serial.println(time);
    Serial.print(F("Debug: datetimeStr = "));
    Serial.println(datetimeStr);
    Serial.print(F("Debug: datetimeStr length = "));
    Serial.println(datetimeStr.length());
    // ------------------------------------

    // Parse the new reference datetime
    if (!parseInitialDateTime(datetimeStr, initialDateTime)) {
        bluetooth.println(F("ERROR:Invalid datetime format"));
        return;
    }

    // Load filename from EEPROM
    loadLastFilenameFromEEPROM(currentFileNameBuffer);
    Serial.print(F("Using last filename from EEPROM: "));
    Serial.println(currentFileNameBuffer);
    
    if (strlen(currentFileNameBuffer) == 0) {
        bluetooth.println(F("ERROR:No previous file found in EEPROM"));
        Serial.println(F("Error: No previous filename stored in EEPROM."));
        softReset();
        return;
    }
    
    // Continue with the existing file
    if (sd.exists(currentFileNameBuffer)) {
        if (dataFile.isOpen()) {
            dataFile.close();
            Serial.println(F("Closed previously open file before continuing session."));
        }

        if (dataFile.open(currentFileNameBuffer, O_WRITE | O_APPEND)) {
            sessionStartMillis = millis(); // Reset the session timer
            currentState = LOGGING_DATA;
            isLogging = true;
            bluetooth.print(F("OK:CONTINUED_SESSION:"));
            bluetooth.println(currentFileNameBuffer);
            bluetooth.println(F("STATUS:LOGGING_STARTED"));
            Serial.print(F("Successfully opened file for continued logging: "));
            Serial.println(currentFileNameBuffer);
            
            // Log a marker in the file about the time reset
            dataFile.print(F("# Time reference reset to: "));
            dataFile.println(datetimeStr);
            dataFile.flush();
        } else {
            bluetooth.println(F("ERROR:Could not open file for appending"));
            Serial.println(F("Error: Could not open file for appending."));
            softReset();
        }
    } else {
        bluetooth.println(F("ERROR:File not found"));
        Serial.println(F("Error: File not found for continued drying."));
        softReset();
    }
}

void handleDownloadFile() {
  currentState = DOWNLOADING_FILE;
  listSDFiles();
}

void listSDFiles() {
  bluetooth.println(F("FILES_LIST_START"));

  SdFile root;
  if (root.open("/", O_READ)) {
    SdFile entry;
    int fileCount = 0;
    
    while (entry.openNext(&root, O_READ)) {
      if (!entry.isSubDir()) {
        fileCount++;
        
        char nameBuffer[128]; // Very large buffer
        memset(nameBuffer, 0, sizeof(nameBuffer));
        
        // Try to get the name with a very large buffer
        bool success = entry.getName(nameBuffer, sizeof(nameBuffer));
        
        Serial.print(F("File #"));
        Serial.print(fileCount);
        Serial.print(F(" - getName success: "));
        Serial.print(success ? "YES" : "NO");
        Serial.print(F(" - Name: '"));
        Serial.print(nameBuffer);
        Serial.println(F("'"));
        
        // Send the name if we have one, otherwise send a numbered placeholder
        if (strlen(nameBuffer) > 0) {
          bluetooth.print(F("FILE:"));
          bluetooth.println(nameBuffer);
        } else {
          // Create a numbered filename for debugging
          char tempName[32];
          snprintf(tempName, sizeof(tempName), "file_%d.txt", fileCount);
          bluetooth.print(F("FILE:"));
          bluetooth.println(tempName);
          Serial.print(F("Using placeholder name: "));
          Serial.println(tempName);
        }
      }
      entry.close();
    }
    
    Serial.print(F("Total files found: "));
    Serial.println(fileCount);
    
    root.close();
  } else {
    bluetooth.println(F("ERROR:Could not open SD root"));
  }

  bluetooth.println(F("FILES_LIST_END"));
}

void sendFileContent(String filename) {
  SdFile file;
  char fileNameBufferLocal[MAX_FILENAME_LENGTH];
  filename.toCharArray(fileNameBufferLocal, MAX_FILENAME_LENGTH);

  if (file.open(fileNameBufferLocal, O_READ)) {
    bluetooth.print(F("FILE_CONTENT_START:"));
    bluetooth.println(filename);

    int lineCount = 0;
    char lineBuffer[128];
    int index = 0;

    while (file.available()) {
      char c = file.read();
      
      if (c == '\n' || index >= sizeof(lineBuffer) - 1) {
        lineBuffer[index] = '\0';
        bluetooth.println(lineBuffer);
        lineCount++;
        index = 0;
        
        // Send progress every 10 lines
        if (lineCount % 10 == 0) {
          bluetooth.print(F("PROGRESS:"));
          bluetooth.println((lineCount * 10) % 100);
        }
        
        delay(100); // Slower for reliability
      } else if (c != '\r') {
        lineBuffer[index++] = c;
      }
    }

    if (index > 0) {
      lineBuffer[index] = '\0';
      bluetooth.println(lineBuffer);
      lineCount++;
    }

    file.close();
    bluetooth.println(F("PROGRESS:100"));
    bluetooth.println(F("FILE_CONTENT_END"));
    
    Serial.print(F("Sent "));
    Serial.print(lineCount);
    Serial.println(F(" lines total"));
  } else {
    bluetooth.println(F("ERROR:File not found"));
  }
}

void createNewFile(String fruit, String datetime) {
  if (dataFile.isOpen()) {
    dataFile.close();
    Serial.println(F("Closed previously open file before creating new one."));
  }

  // Format the filename
  snprintf(currentFileNameBuffer, MAX_FILENAME_LENGTH, "%s_%s.txt", fruit.c_str(), datetime.c_str());
  
  // Replace spaces if any
  for (int i = 0; i < MAX_FILENAME_LENGTH; i++) {
    if (currentFileNameBuffer[i] == ' ') {
      currentFileNameBuffer[i] = '_';
    }
    if (currentFileNameBuffer[i] == '\0') break;
  }

  Serial.print(F("Creating file: "));
  Serial.println(currentFileNameBuffer);

  if (dataFile.open(currentFileNameBuffer, O_WRITE | O_CREAT | O_TRUNC)) {
    dataFile.println(F("Timestamp,InsideTemp,InsideHum,MiddleTemp,MiddleHum,OutsideTemp,OutsideHum,Weight,SolarVoltage,PowerSource"));
    Serial.println(F("File created successfully and open for logging."));
    
    // Save the filename to EEPROM
    saveLastFilenameToEEPROM(currentFileNameBuffer);
    Serial.println(F("Filename saved to EEPROM."));
    
    bluetooth.println(F("OK:FILE_CREATED"));
  } else {
    Serial.println(F("Error: Creating File or opening it for logging."));
    bluetooth.println(F("ERROR:FILE_CREATION_FAILED"));
    sdCardAvailable = false;
    isLogging = false;
  }
}

void performTare() {
  unsigned long tareStart = millis();
  bool tareSuccess = false;

  bluetooth.println(F("STATUS:TARING"));

  while (millis() - tareStart < 5000) { // Try for 5 seconds
    if (scale.is_ready()) {
      scale.tare();
      bluetooth.println(F("OK:TARE_COMPLETE"));
      tareSuccess = true;
      break;
    }
    delay(100);
  }

  if (!tareSuccess) {
    bluetooth.println(F("ERROR:Tare failed"));
    Serial.println(F("ERROR: Tare failed, attempting to re-initialize scale."));
    // Re-initialize and set scale factor if tare fails
    scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
    scale.set_scale(calibration_factor);
  }
}

// startLogging() is now simpler, as file opening is handled by createNewFile/handleContinuedDrying
void startLogging() {
  Serial.println(F("DEBUG: startlogging()")); // Add this
  if (!isLogging) {
    // Serial.println(F("DEBUG: isLogging is false, proceeding to activate.")); // Add this
    if (!dataFile.isOpen()) {
      Serial.println(F("ERROR:No file open to start logging.")); // Existing
      bluetooth.println(F("ERROR:No file open to start logging."));
      Serial.println(F("ERROR: START command received but no file is open."));
      softReset();
      return;
    }
    isLogging = true;
    sessionStartMillis = millis();
    bluetooth.println(F("STATUS:LOGGING_STARTED"));
    Serial.println(F("Data logging started"));
  } else {
    // Serial.println(F("DEBUG: Already logging, ignoring START command.")); // Add this
    bluetooth.println(F("STATUS:ALREADY_LOGGING"));
  }
  // Serial.println(F("DEBUG: Exiting startLogging().")); // Add this
}

void stopLogging() {
  isLogging = false;
  // --- IMPORTANT CHANGE: Close the dataFile when logging stops ---
  if (dataFile.isOpen()) {
    dataFile.close();
    Serial.println(F("Data file closed."));
  }
  bluetooth.println(F("STATUS:LOGGING_STOPPED"));
  Serial.println(F("Data logging stopped"));
  delay(1000);
  softReset();
}

void softReset() {
  currentState = WAITING_FOR_COMMAND;
  isLogging = false;
  if (dataFile.isOpen()) {
    dataFile.close();
    Serial.println(F("Data file closed during soft reset."));
  }
  // Note: We don't clear currentFileNameBuffer as it might be needed
  currentFruit = "";
  sessionStartTime = "";
  sessionStartMillis = 0;

  bluetooth.println(F("STATUS:SYSTEM_RESET"));
  Serial.println(F("System reset - sending alert"));
  delay(2000);
  lastAlertTime = millis();
  sendAlert();
}

void logDataToSD(float insideTemp, float insideHum,
                 float middleTemp, float middleHum,
                 float outsideTemp, float outsideHum,
                 float weight, float solarVoltage,
                 unsigned long currentMillis) {
  // --- IMPORTANT CHANGE: Use the global dataFile object directly ---
  // --- IMPORTANT CHANGE: Check if dataFile is actually open before writing ---
  Serial.println(F("DEBUG: logDataToSD."));
  if (!sdCardAvailable || !isLogging || !dataFile.isOpen()) {
    // Debug output to help diagnose why logging might not occur
    // Serial.println(F("DEBUG: Skipping log. State:"));
    // Serial.print(F("SD Avail: ")); Serial.println(sdCardAvailable);
    // Serial.print(F("Is Logging: ")); Serial.println(isLogging);
    // Serial.print(F("File Open: ")); Serial.println(dataFile.isOpen());
    Serial.println(F("DEBUG: logDataToSD returning early (not logging or file not open)."));

    return;
  }

  // Calculate elapsed time in seconds
  unsigned long elapsedMillis = currentMillis - sessionStartMillis;
  unsigned long elapsedSeconds = elapsedMillis / 1000;
    
  // Calculate current datetime
  SessionDateTime currentDT;
  calculateCurrentDateTime(elapsedSeconds, currentDT);
    
  // Format timestamp
  String timestamp = formatDateTime(currentDT, elapsedMillis % 1000);
  
  dataFile.print(timestamp); dataFile.print(F(","));
  dataFile.print(insideTemp, 1); dataFile.print(F(","));
  dataFile.print(insideHum, 1); dataFile.print(F(","));
  dataFile.print(middleTemp, 1); dataFile.print(F(","));
  dataFile.print(middleHum, 1); dataFile.print(F(","));
  dataFile.print(outsideTemp, 1); dataFile.print(F(","));
  dataFile.print(outsideHum, 1); dataFile.print(F(","));
  dataFile.print(weight, 1); dataFile.print(F(","));
  dataFile.print(solarVoltage, 2); dataFile.print(F(","));
  dataFile.println(usingSolar ? F("SOLAR") : F("AC"));

  // --- IMPORTANT CHANGE: Flush data to SD card immediately after writing ---
  // This ensures data is written to disk and reduces risk of data loss on power failure.
  dataFile.flush();
}

void displaySystemStatus(float insideTemp, float insideHum,
                         float middleTemp, float middleHum,
                         float outsideTemp, float outsideHum,
                         float weight, float solarVoltage) {
  // Only display if logging is active
  if (!isLogging) return;

  Serial.println(F("\n==== System Status ===="));
  Serial.print(F("File: ")); Serial.println(currentFileNameBuffer); // This should now be correct
  Serial.print(F("Logging: ")); Serial.println(isLogging ? F("YES") : F("NO"));
  Serial.print(F("Power: ")); Serial.println(usingSolar ? F("SOLAR") : F("AC"));
  Serial.print(F("Solar: ")); Serial.print(solarVoltage, 2); Serial.println(F(" V"));
  Serial.print(F("Weight: ")); Serial.print(weight, 1); Serial.println(F(" g"));
  Serial.print(F("Inside Temp/Hum: ")); Serial.print(insideTemp, 1); Serial.print(F("C, ")); Serial.print(insideHum, 1); Serial.println(F("%"));
  Serial.print(F("Middle Temp/Hum: ")); Serial.print(middleTemp, 1); Serial.print(F("C, ")); Serial.print(middleHum, 1); Serial.println(F("%"));
  Serial.print(F("Outside Temp/Hum: ")); Serial.print(outsideTemp, 1); Serial.print(F("C, ")); Serial.print(outsideHum, 1); Serial.println(F("%"));
  Serial.println(F("======================"));
}

void sendBluetoothStatus(float insideTemp, float insideHum,
                         float middleTemp, float middleHum,
                         float outsideTemp, float outsideHum,
                         float weight, float solarVoltage) {
  // Only send if logging is active to prevent unnecessary BT spam
  Serial.println(F("DEBUG: sendBluetoothStatus."));
  if (!isLogging){
    Serial.println(F("DEBUG: (not logging)."));
    return;
  } 
  
  Serial.print(F("DEBUG: send BT: ")); // NEW

  bluetooth.println(F("DATA_UPDATE"));
  bluetooth.print(F("IN:")); bluetooth.print(insideTemp, 1); bluetooth.print(F(",")); bluetooth.println(insideHum, 1);
  bluetooth.print(F("MID:")); bluetooth.print(middleTemp, 1); bluetooth.print(F(",")); bluetooth.println(middleHum, 1);
  bluetooth.print(F("OUT:")); bluetooth.print(outsideTemp, 1); bluetooth.print(F(",")); bluetooth.println(outsideHum, 1);
  bluetooth.print(F("WEIGHT:")); bluetooth.println(weight, 1);
  bluetooth.print(F("SOLAR:")); bluetooth.println(solarVoltage, 2);
  bluetooth.print(F("POWER:")); bluetooth.println(usingSolar ? F("SOLAR") : F("AC"));

  Serial.println(F("DEBUG: BT data sent.")); // NEW
}

void processBluetoothCommands() {
  while (bluetooth.available()) {
    char inChar = bluetooth.read();

    if (inChar == '\n' || inChar == '\r') {
      if (btCmdBufferIndex > 0) {
        btCmdBuffer[btCmdBufferIndex] = '\0'; // Null-terminate the string
        String command = String(btCmdBuffer);

        Serial.print(F("Received BT command: ")); // Debug received command
        Serial.println(command);

        if (currentState == WAITING_FOR_COMMAND) {
          if (command.startsWith("NEW_DRYING:")) {
            handleNewDrying(command);
          } else if (command.startsWith("CONTINUED_DRYING:")) {
            handleContinuedDrying(command);
          } else if (command.startsWith("GETCONFIG") || command.startsWith("SET:") || command == "SAVECONFIG") {
            handleConfigCommand(command);
          }else if (command == "DOWNLOAD_FILE") {
            handleDownloadFile();
          } else if (command == "RESET_SYSTEM") { // Added an explicit reset command
            softReset();
          } else {
            bluetooth.println(F("ERROR:UNKNOWN_COMMAND_WAITING_STATE"));
          }
        } else if (currentState == LOGGING_DATA) {
          if (command == "START") { // This command assumes file is already created/opened
            startLogging(); // This now just sets the isLogging flag
          } else if (command == "STOP") {
            stopLogging();
          } else if (command == "T" || command == "t") {
            performTare();
          } else if (command.startsWith("GETCONFIG") || command.startsWith("SET:") || command == "SAVECONFIG") {
            handleConfigCommand(command);
          }else if (command == "RESET_SYSTEM") {
            stopLogging(); // Stop logging first, then soft reset
          } else {
            bluetooth.println(F("ERROR:UNKNOWN_COMMAND_LOGGING_STATE"));
          }
        } else if (currentState == DOWNLOADING_FILE) {
          if (command.startsWith("GET_FILE:")) {
            String filename = command.substring(9);
            sendFileContent(filename);
          } else if (command == "BACK") {
            softReset(); // Exit download mode and go back to waiting
          } else if (command == "RESET_SYSTEM") {
            softReset();
          } else {
            bluetooth.println(F("ERROR:UNKNOWN_COMMAND_DOWNLOADING_STATE"));
          }
        }

        btCmdBufferIndex = 0; // Reset buffer index for next command
        memset(btCmdBuffer, 0, BT_CMD_BUFFER_SIZE);
      }
    } else {
      if (btCmdBufferIndex < (BT_CMD_BUFFER_SIZE - 1)) { // Check buffer bounds
        btCmdBuffer[btCmdBufferIndex++] = inChar;
      } else {
        bluetooth.println(F("ERROR:Command too long"));
        btCmdBufferIndex = 0; // Reset buffer to avoid overflow
        memset(btCmdBuffer, 0, BT_CMD_BUFFER_SIZE); // Clear the buffer on overflow
      }
    }
  }
}

void setup() {
  Serial.begin(9600);
  bluetooth.begin(9600);

  loadConfig(); // Load configuration from EEPROM

  Serial.println(F("\nSystem Initialization"));

  // Initialize SD card using SdFat
  Serial.print(F("Initializing SD card (SdFat)..."));
  // Use sd.begin() with the chip select pin
  if (!sd.begin(SD_CS_PIN, SPI_HALF_SPEED)) { // SPI_HALF_SPEED can help with some cards
    Serial.println(F("FAILED"));
    sdCardAvailable = false;
  } else {
    Serial.println(F("OK"));
    sdCardAvailable = true;
  }

  // Initialize relay (set to AC by default)
  pinMode(RELAY_POWER, OUTPUT);
  digitalWrite(RELAY_POWER, AC_POWER_ACTIVE); // Start with AC power

  // Initialize DHT sensors
  initializeDHTSensor(dhtInside, "Inside", dhtInside_available);
  delay(200); // Small delay between sensor initializations
  initializeDHTSensor(dhtMiddle, "Middle", dhtMiddle_available);
  delay(200);
  initializeDHTSensor(dhtOutside, "Outside", dhtOutside_available);
  delay(200);

  // Initialize weight sensor
  Serial.print(F("Initializing Weight sensor..."));
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  if (scale.wait_ready_timeout(5000)) { // Wait up to 5 seconds for sensor to be ready
    scale.set_scale(calibration_factor);
    Serial.println(F("OK"));
  } else {
    Serial.println(F("FAILED"));
  }

  Serial.println(F("System ready - sending initial alert"));
  delay(2000); // Give some time for serial/bluetooth to be ready
  lastAlertTime = millis(); // Set time for immediate alert
  sendAlert();
}

void loop() {
  unsigned long currentMillis = millis();

  // Always handle Bluetooth commands, regardless of system state
  processBluetoothCommands();

  // Serial.print(F("Current State: "));
  // if (currentState == WAITING_FOR_COMMAND) Serial.print(F("WAITING_FOR_COMMAND"));
  // else if (currentState == LOGGING_DATA) Serial.print(F("LOGGING_DATA"));
  // else if (currentState == DOWNLOADING_FILE) Serial.print(F("DOWNLOADING_FILE"));
  // Serial.print(F(" | Is Logging: "));
  // Serial.println(isLogging ? F("TRUE") : F("FALSE"));

  // State machine for different system behaviors
  if (currentState == WAITING_FOR_COMMAND) {
    // In waiting state, periodically send an alert to the Bluetooth app
    if (currentMillis - lastAlertTime >= alert_interval) {
      lastAlertTime = currentMillis;
      sendAlert();
    }
    delay(100); // Small delay to prevent busy-waiting
    return; // Exit loop, wait for command
  }

  // If not in LOGGING_DATA state, skip sensor readings and logging
  if (currentState != LOGGING_DATA) {
    // For DOWNLOADING_FILE state, we only process BT commands, no sensor reading
    delay(100); // Small delay to prevent busy-waiting
    return;
  }

  // --- Code below runs only when currentState == LOGGING_DATA ---
  // Serial.println(F("DEBUG: Entered LOGGING_DATA processing block."));

  // Periodically check and reconnect disconnected DHT sensors
  if (currentMillis - lastReinitAttempt >= reinit_interval) {
    lastReinitAttempt = currentMillis;
    if (!dhtInside_available) initializeDHTSensor(dhtInside, "Inside", dhtInside_available);
    if (!dhtMiddle_available) initializeDHTSensor(dhtMiddle, "Middle", dhtMiddle_available);
    if (!dhtOutside_available) initializeDHTSensor(dhtOutside, "Outside", dhtOutside_available);
  }

  // Read all sensor values
  float insideTemp = readDHTTemperature(dhtInside, dhtInside_available);
  float insideHum = readDHTHumidity(dhtInside, dhtInside_available);
  float middleTemp = readDHTTemperature(dhtMiddle, dhtMiddle_available);
  float middleHum = readDHTHumidity(dhtMiddle, dhtMiddle_available);
  float outsideTemp = readDHTTemperature(dhtOutside, dhtOutside_available);
  float outsideHum = readDHTHumidity(dhtOutside, dhtOutside_available);

  // Read weight (get_units(3) for 3 readings average)
  float weight = scale.get_units(3);
  // Calculate solar voltage using voltage divider formula
  float solarVoltage = (analogRead(SOLAR_VOLTAGE_PIN) * (5.0 / 1023.0)) * ((R1 + R2) / R2);

  // Serial.print(F("DEBUG: Sensor Values - Inside: ")); Serial.print(insideTemp); Serial.print(F("C, ")); Serial.print(insideHum); Serial.print(F("%; Middle: ")); Serial.print(middleTemp); Serial.print(F("C, ")); Serial.print(middleHum); Serial.print(F("%; Outside: ")); Serial.print(outsideTemp); Serial.print(F("C, ")); Serial.print(outsideHum); Serial.print(F("%; Weight: ")); Serial.print(weight); Serial.print(F("g; Solar: ")); Serial.print(solarVoltage); Serial.println(F("V"));

  // Handle power source switching based on solar voltage
  handlePowerSwitching(solarVoltage, currentMillis);

  // Display system status on Serial Monitor at specified intervals
  if (currentMillis - lastPrintTime >= display_interval) {
    Serial.println(F("DEBUG: Triggering displaySystemStatus.")); // New debug
    lastPrintTime = currentMillis;
    displaySystemStatus(insideTemp, insideHum, middleTemp, middleHum,
                        outsideTemp, outsideHum, weight, solarVoltage);
  } //else {
  //   // New debug to show if display condition is not met
  //   Serial.print(F("DEBUG: displaySystemStatus not yet due (next in "));
  //   Serial.print(display_interval - (currentMillis - lastPrintTime));
  //   Serial.println(F("ms)."));
  // }

  // Send system status via Bluetooth at specified intervals
  if (currentMillis - lastBluetoothTime >= bluetooth_interval) {
    Serial.println(F("DEBUG: Triggering sendBluetoothStatus.")); // New debug
    lastBluetoothTime = currentMillis;
    sendBluetoothStatus(insideTemp, insideHum, middleTemp, middleHum,
                        outsideTemp, outsideHum, weight, solarVoltage);
  }//else {
  //   // New debug to show if bluetooth condition is not met
  //   Serial.print(F("DEBUG: sendBluetoothStatus not yet due (next in "));
  //   Serial.print(bluetooth_interval - (currentMillis - lastBluetoothTime));
  //   Serial.println(F("ms)."));
  // }

  // Log data to SD card at specified intervals (only if logging is active AND file is open)
  if (isLogging && sdCardAvailable && dataFile.isOpen() && (currentMillis - lastLogTime >= sd_log_interval)) {
    Serial.println(F("DEBUG: Triggering logDataToSD.")); // New debug
    Serial.print(F("DEBUG: SD Card Available: ")); Serial.println(sdCardAvailable ? F("TRUE") : F("FALSE")); // KEEP this
    Serial.print(F("DEBUG: Data File Open: ")); Serial.println(dataFile.isOpen() ? F("TRUE") : F("FALSE"));     // KEEP this
    lastLogTime = currentMillis;
    logDataToSD(insideTemp, insideHum, middleTemp, middleHum,
                outsideTemp, outsideHum, weight, solarVoltage, currentMillis);
  } //else {
  //   // New debug to show if SD log condition is not met
  //   Serial.print(F("DEBUG: logDataToSD not yet due (next in "));
  //   Serial.print(sd_log_interval - (currentMillis - lastLogTime));
  //   Serial.print(F("ms) or conditions not met (IsLogging: ")); Serial.print(isLogging ? F("T") : F("F"));
  //   Serial.print(F(", SDAvail: ")); Serial.print(sdCardAvailable ? F("T") : F("F"));
  //   Serial.print(F(", FileOpen: ")); Serial.println(dataFile.isOpen() ? F("T") : F("F"));
  // }

  delay(10); // Small delay to prevent busy-waiting and allow other tasks
}