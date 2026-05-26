export interface BoardDisplaySettings {
  showWorkOrderNumber: boolean;
  showCustomerReference: boolean;
  showPickupReference: boolean;
  showDeliveryReference: boolean;
  showCity: boolean;
  showSkids: boolean;
  showStopType: boolean;
  showBoardNote: boolean;
  showNormalNotes: boolean;
  showInternalNotes: boolean;
  showFinDetails: boolean;
}

export const defaultBoardDisplaySettings: BoardDisplaySettings = {
  showWorkOrderNumber: true,
  showCustomerReference: false,
  showPickupReference: false,
  showDeliveryReference: false,
  showCity: true,
  showSkids: true,
  showStopType: true,
  showBoardNote: true,
  showNormalNotes: false,
  showInternalNotes: false,
  showFinDetails: false,
};

export const BOARD_DISPLAY_SETTINGS_KEY = 'dispatch_pro_board_display_settings';

export function loadBoardDisplaySettings(): BoardDisplaySettings {
  if (typeof window === 'undefined') {
    return defaultBoardDisplaySettings;
  }

  try {
    const savedSettings = window.localStorage.getItem(BOARD_DISPLAY_SETTINGS_KEY);

    if (!savedSettings) {
      return defaultBoardDisplaySettings;
    }

    return {
      ...defaultBoardDisplaySettings,
      ...JSON.parse(savedSettings),
    };
  } catch (error) {
    console.error('Error loading board display settings:', error);
    return defaultBoardDisplaySettings;
  }
}

export function saveBoardDisplaySettings(settings: BoardDisplaySettings) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    BOARD_DISPLAY_SETTINGS_KEY,
    JSON.stringify(settings)
  );

  window.dispatchEvent(new Event('board-display-settings-updated'));
}

export function resetBoardDisplaySettings() {
  saveBoardDisplaySettings(defaultBoardDisplaySettings);
}