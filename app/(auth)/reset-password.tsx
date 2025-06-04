import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import InputField from '@/components/InputField';
import { useLanguage } from '@/context/LanguageContext';
import CustomButton from '@/components/CustomButton';
import { icons, images } from '@/constants';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useSignIn, useAuth } from '@clerk/clerk-expo';
import { StatusBar } from 'expo-status-bar';
import CustomErrorModal from '@/components/CustomErrorModal';

const ResetPassword = () => {
  const { t, language } = useLanguage();
  const { isLoaded, signIn } = useSignIn();
  const { signOut } = useAuth();
  const { email } = useLocalSearchParams();
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCustomErrorModal, setShowCustomErrorModal] = useState(false);
  const [customErrorMessage, setCustomErrorMessage] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const showErrorAlert = (message: string) => {
    setCustomErrorMessage(message);
    setShowCustomErrorModal(true);
  };

  const onResetPasswordPress = async () => {
    if (!isLoaded) return;

    if (!code || !newPassword) {
      showErrorAlert(t.fillAllFields);
      return;
    }

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password: newPassword,
      });

      if (result.status === 'complete') {
        setShowSuccessModal(true);
      } else {
        showErrorAlert(t.passwordResetFailed);
      }
    } catch (err: any) {
      console.error('Error during reset password:', err);
      let errorMessageKey = t.passwordResetFailed;

      if (err.errors && err.errors.length > 0) {
        const clerkErrorCode = err.errors[0].code;

        switch (clerkErrorCode) {
          case 'form_code_expired':
          case 'form_code_incorrect':
            errorMessageKey = t.invalidCode;
            break;
          default:
            errorMessageKey = err.errors[0].longMessage || t.passwordResetFailed;
            break;
        }
      }

      showErrorAlert(errorMessageKey);
    }
  };

  const handleSuccessModalClose = async () => {
    setShowSuccessModal(false);
    await signOut();
    router.replace('/sign-in');
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-5 pb-10">
        {/* عنوان الصفحة */}
        <Text className={`text-[25px] text-black ${language === 'ar' ? 'font-CairoExtraBold text-right' : 'font-JakartaSemiBold text-left'} mt-10`}>
          {t.resetPassword}
        </Text>

        {/* وصف الصفحة */}
        <Text className={`text-base text-gray-500 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-Jakarta text-left'} mt-2`}>
          {t.resetPasswordDescription}
        </Text>

        {/* حقل رمز التحقق */}
        <InputField
          label={t.verificationCode}
          placeholder="123456"
          value={code}
          onChangeText={(text) => setCode(text)}
          keyboardType="numeric"
          labelStyle={language === 'ar' ? 'text-right font-CairoBold text-orange-500' : 'text-left font-JakartaBold text-orange-500'}
          className={`${language === 'ar' ? 'text-right placeholder:text-right font-CairoBold ' : 'text-left placeholder:text-left'}`}
        />

        {/* حقل كلمة المرور الجديدة */}
        <InputField
          label={t.newPassword}
          placeholder="**********"
          value={newPassword}
          onChangeText={(text) => setNewPassword(text)}
          secureTextEntry
          labelStyle={language === 'ar' ? 'text-right font-CairoBold text-orange-500' : 'text-left font-JakartaBold text-orange-500'}
          className={`${language === 'ar' ? 'text-right placeholder:text-right font-CairoBold ' : 'text-left placeholder:text-left'}`}
        />

        {/* زر إعادة تعيين كلمة المرور */}
        <CustomButton
          title={t.resetPasswordButton}
          onPress={onResetPasswordPress}
          className="mt-6"
        />

        {/* رابط العودة إلى تسجيل الدخول */}
        <TouchableOpacity onPress={() => router.push('/sign-in')} className="mt-4">
          <Text className={`text-sm text-orange-500 ${language === 'ar' ? 'text-right font-CairoBold' : 'text-left font-JakartaBold'}`}>
            {t.backToSignIn}
          </Text>
        </TouchableOpacity>
      </View>
      <StatusBar backgroundColor="#fff" style="dark" />

      <CustomErrorModal
        visible={showCustomErrorModal}
        message={customErrorMessage}
        onClose={() => setShowCustomErrorModal(false)}
        title={t.error}
        t={t}
      />

      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="slide"
        onRequestClose={handleSuccessModalClose}
      >
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className="bg-white p-7 rounded-2xl min-h-[300px] w-11/12">
            <Image
              source={images.check}
              className="w-[110px] h-[110px] mx-auto my-5"
              accessibilityLabel="Success check icon"
            />
            <Text className={`text-3xl ${language === 'ar' ? 'font-CairoBold pt-3' : 'font-JakartaBold'} text-center`}>
              {t.success}
            </Text>
            <Text className={`text-base text-gray-400 ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-center mt-2`}>
              {t.passwordResetSuccessDescription}
            </Text>
            <CustomButton
              title={t.logIn}
              onPress={handleSuccessModalClose}
              className="mt-5"
              accessibilityLabel="OK Button"
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default ResetPassword;