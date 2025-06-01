import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface CustomErrorModalProps {
  visible: boolean;
  message: string;
  onClose: () => void;
}

const CustomErrorModal: React.FC<CustomErrorModalProps> = ({
  visible,
  message,
  onClose,
}) => {
  if (!visible) {
    return null;
  }

  return (
    <Modal
      transparent={true}
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View className="bg-orange-50 p-6 rounded-xl shadow-md w-[90%] max-w-sm">
          <View className="items-center mb-4">
            <MaterialIcons name="warning" size={40} color="#F97316" />
            <Text className="text-xl font-CairoBold text-center mt-2 text-gray-800">Error</Text>
          </View>
          <Text className="text-base font-CairoRegular text-center mb-6 text-gray-600">
            {message}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            className="bg-orange-500 py-3 rounded-xl items-center"
          >
            <Text className="text-white font-CairoBold text-lg">OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default CustomErrorModal; 