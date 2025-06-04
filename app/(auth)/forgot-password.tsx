import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import InputField from '@/components/InputField'; // استيراد InputField
import { useLanguage } from '@/context/LanguageContext';
import CustomButton from '@/components/CustomButton';
import { icons, images } from '@/constants';
import { Link, router } from 'expo-router';
import { useSignIn } from '@clerk/clerk-expo'; // استيراد useSignIn من Clerk
import { StatusBar } from 'expo-status-bar';
import CustomErrorModal from '@/components/CustomErrorModal'; // Import CustomErrorModal

const ForgotPassword = () => {
  const { t, language } = useLanguage();
  const { isLoaded, signIn } = useSignIn(); // استخدام useSignIn من Clerk
  const [email, setEmail] = useState(''); // حالة لتخزين البريد الإلكتروني
  const [showCustomErrorModal, setShowCustomErrorModal] = useState(false); // State for error modal
  const [customErrorMessage, setCustomErrorMessage] = useState(''); // State for error message
  const [showSuccessModal, setShowSuccessModal] = useState(false); // State for success modal

  const showErrorAlert = (message: string) => {
    setCustomErrorMessage(message);
    setShowCustomErrorModal(true);
  };

  const onResetPasswordPress = async () => {
    if (!isLoaded) return;

    if (!email) {
      showErrorAlert(t.fillEmailField); // Use custom alert
      return;
    }

    try {
      // إرسال رمز التحقق لإعادة تعيين كلمة المرور
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email,
      });

      // Show success modal instead of native alert
      setShowSuccessModal(true);

      // The navigation to reset-password will happen when the success modal is closed
    } catch (err: any) {
      console.error('Error during reset password:', err);
      // Check for specific Clerk error codes or use a generic translated message
      let errorMessageKey = t.passwordResetFailed; // Default to generic failed message

      if (err.errors && err.errors.length > 0) {
        const clerkErrorCode = err.errors[0].code;

        // Add specific error code handling if needed, otherwise use longMessage or generic
        // For now, using longMessage if available, otherwise generic
        // errorMessageKey = err.errors[0].longMessage || t.passwordResetFailed;

        switch (clerkErrorCode) {
          case 'form_identifier_not_found':
            errorMessageKey = t.userNotFound;
            break;
          case 'form_identifier_invalid':
            errorMessageKey = t.identifierInvalid;
            break;
          // Add other specific Clerk error codes as needed for password reset
          default:
            // If the error code is not specifically handled, use the long message from Clerk
            // or a generic translated message.
            if (err.errors[0].longMessage === 'Identifier is invalid.') {
              errorMessageKey = t.identifierInvalid;
            } else {
              // Fallback to Clerk's long message or a generic translated message
              errorMessageKey = err.errors[0].longMessage || t.passwordResetFailed;
            }
            break;
        }

      }

      showErrorAlert(errorMessageKey);
    }
  };

  // Function to handle closing the success modal and navigating
  const handleSuccessModalClose = () => {
    setShowSuccessModal(false);
    router.push({
      pathname: '/reset-password',
      params: { email },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-5 pb-10">
        {/* عنوان الصفحة */}
        <Text className={`text-[25px] text-black ${language === 'ar' ? 'font-CairoExtraBold text-right' : 'font-JakartaSemiBold text-left'} mt-10`}>
          {t.forgotPassword}
        </Text>

        {/* وصف الصفحة */}
        <Text className={`text-base text-gray-500 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-Jakarta text-left'} mt-2`}>
          {t.forgotPasswordDescription}
        </Text>

        {/* حقل البريد الإلكتروني */}
        <InputField
          label={t.email}
          placeholder="user@example.com"
          value={email}
          onChangeText={(text) => setEmail(text)}
          keyboardType="email-address"
          labelStyle={language === 'ar' ? 'text-right font-CairoBold text-orange-500' : 'text-left font-JakartaBold text-orange-500'}
          className={`${language === 'ar' ? 'text-right placeholder:text-right font-CairoBold ' : 'text-left placeholder:text-left'}`}
        />

        {/* زر إرسال الرابط */}
        <CustomButton
          title={t.sendResetLink}
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
      <CustomErrorModal // Add CustomErrorModal component
        visible={showCustomErrorModal}
        message={customErrorMessage}
        onClose={() => setShowCustomErrorModal(false)}
        title={t.error}
        t={t} // Pass the t object
      />

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="slide"
        onRequestClose={handleSuccessModalClose}
      >
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className="bg-white p-7 rounded-2xl min-h-[300px] w-11/12">
            <Image
              source={images.check} // Assuming you have a checkmark image in your assets
              className="w-[110px] h-[110px] mx-auto my-5"
              accessibilityLabel="Success check icon"
            />
            <Text className={`text-3xl ${language === 'ar' ? 'font-CairoBold pt-3' : 'font-JakartaBold'} text-center`}>
              {t.success}
            </Text>
            <Text className={`text-base text-gray-400 ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-center mt-2`}>
              {t.resetPasswordCodeSent}
            </Text>
            <CustomButton
              title={t.ok} // Using t.ok for the button text
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

export default ForgotPassword;