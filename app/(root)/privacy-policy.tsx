import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import Header from '@/components/Header';

// Skeleton Loading Component
const PrivacyPolicySkeleton = () => (
  <Animated.View entering={FadeIn} className="flex-1 px-4 py-6">
    <View className="space-y-6">
      {/* Title Skeleton */}
      <View className="w-3/4 h-8 bg-gray-200 rounded-lg animate-pulse" />
      
      {/* Content Skeleton */}
      {[1, 2, 3, 4, 5].map((_, index) => (
        <View key={index} className="space-y-3">
          <View className="w-1/2 h-6 bg-gray-200 rounded-lg animate-pulse" />
          <View className="w-full h-4 bg-gray-200 rounded-lg animate-pulse" />
          <View className="w-5/6 h-4 bg-gray-200 rounded-lg animate-pulse" />
          <View className="w-4/6 h-4 bg-gray-200 rounded-lg animate-pulse" />
        </View>
      ))}
    </View>
  </Animated.View>
);

export default function PrivacyPolicy() {
  const router = useRouter();
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading time
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  // Section content for both languages
  const sections = [
    {
      key: 'introduction',
      title: language === 'ar' ? 'مقدمة' : 'Introduction',
      content: language === 'ar'
        ? 'مرحباً بك في سياسة الخصوصية لتطبيق وصلني. نحن نقدر خصوصيتك ونلتزم بحماية بياناتك الشخصية. يرجى قراءة هذه السياسة بعناية لفهم كيفية جمع واستخدام وحماية معلوماتك.'
        : "Welcome to Wasselny's Privacy Policy. We value your privacy and are committed to protecting your personal data. Please read this policy carefully to understand how we collect, use, and protect your information."
    },
    {
      key: 'info-collect',
      title: language === 'ar' ? 'المعلومات التي نجمعها' : 'Information We Collect',
      content: language === 'ar'
        ? (
          <>
            <Text>• البيانات الشخصية (مثل الاسم، البريد الإلكتروني، رقم الهاتف)</Text>
            <Text>• بيانات الموقع الجغرافي</Text>
            <Text>• بيانات الاستخدام (مثل تفاعلك مع التطبيق)</Text>
            <Text>• بيانات الجهاز (مثل نوع الجهاز ونظام التشغيل)</Text>
            <Text>• ملفات تعريف الارتباط وتقنيات التتبع</Text>
          </>
        )
        : (
          <>
            <Text>• Personal data (such as name, email, phone number)</Text>
            <Text>• Location data</Text>
            <Text>• Usage data (such as your interactions with the app)</Text>
            <Text>• Device data (such as device type and OS)</Text>
            <Text>• Cookies and tracking technologies</Text>
          </>
        )
    },
    {
      key: 'info-use',
      title: language === 'ar' ? 'كيفية استخدام المعلومات' : 'How We Use Your Information',
      content: language === 'ar'
        ? (
          <>
            <Text>• تقديم خدمات التطبيق وتحسينها</Text>
            <Text>• تخصيص تجربتك</Text>
            <Text>• التواصل معك بشأن التحديثات أو العروض</Text>
            <Text>• التحليل وتحسين الأداء</Text>
            <Text>• الامتثال للمتطلبات القانونية</Text>
          </>
        )
        : (
          <>
            <Text>• To provide and improve our services</Text>
            <Text>• To personalize your experience</Text>
            <Text>• To communicate with you about updates or offers</Text>
            <Text>• For analytics and performance improvement</Text>
            <Text>• To comply with legal requirements</Text>
          </>
        )
    },
    {
      key: 'info-share',
      title: language === 'ar' ? 'مشاركة المعلومات' : 'How We Share Your Information',
      content: language === 'ar'
        ? (
          <>
            <Text>• مع مزودي الخدمة (مثل خدمات الاستضافة والتحليلات)</Text>
            <Text>• لأسباب قانونية أو استجابة للطلبات الحكومية</Text>
            <Text>• بموافقتك الصريحة</Text>
            <Text>• لا نبيع بياناتك لأي طرف ثالث</Text>
          </>
        )
        : (
          <>
            <Text>• With service providers (such as hosting and analytics)</Text>
            <Text>• For legal reasons or in response to government requests</Text>
            <Text>• With your explicit consent</Text>
            <Text>• We do not sell your data to third parties</Text>
          </>
        )
    },
    {
      key: 'security',
      title: language === 'ar' ? 'أمان البيانات' : 'Data Security',
      content: language === 'ar'
        ? 'نستخدم تقنيات وإجراءات أمان متقدمة لحماية بياناتك من الوصول أو الاستخدام غير المصرح به.'
        : 'We use advanced security technologies and procedures to protect your data from unauthorized access or use.'
    },
    {
      key: 'retention',
      title: language === 'ar' ? 'الاحتفاظ بالبيانات' : 'Data Retention',
      content: language === 'ar'
        ? 'نحتفظ ببياناتك فقط للمدة اللازمة لتحقيق الأغراض المذكورة في هذه السياسة أو كما يقتضي القانون.'
        : 'We retain your data only as long as necessary for the purposes described in this policy or as required by law.'
    },
    {
      key: 'rights',
      title: language === 'ar' ? 'حقوق المستخدم' : 'User Rights',
      content: language === 'ar'
        ? (
          <>
            <Text>• الوصول إلى بياناتك</Text>
            <Text>• تصحيح أو تحديث بياناتك</Text>
            <Text>• حذف حسابك</Text>
            <Text>• الاعتراض أو تقييد معالجة بياناتك</Text>
            <Text>• طلب نقل بياناتك</Text>
          </>
        )
        : (
          <>
            <Text>• Access your data</Text>
            <Text>• Correct or update your data</Text>
            <Text>• Delete your account</Text>
            <Text>• Object to or restrict processing</Text>
            <Text>• Request data portability</Text>
          </>
        )
    },
    {
      key: 'children',
      title: language === 'ar' ? 'خصوصية الأطفال' : "Children's Privacy",
      content: language === 'ar'
        ? 'لا يُسمح للأطفال دون سن 18 باستخدام التطبيق دون موافقة ولي الأمر. إذا اكتشفنا جمع بيانات من طفل دون هذا السن، سنحذفها فوراً.'
        : "Our app is not intended for children under 18. If we learn we have collected data from a child under this age, we will delete it immediately."
    },
    {
      key: 'international',
      title: language === 'ar' ? 'النقل الدولي للبيانات' : 'International Transfers',
      content: language === 'ar'
        ? 'قد يتم نقل بياناتك ومعالجتها خارج بلدك. نحن نضمن حماية بياناتك وفقاً لهذه السياسة.'
        : 'Your data may be transferred and processed outside your country. We ensure your data is protected as described in this policy.'
    },
    {
      key: 'changes',
      title: language === 'ar' ? 'تغييرات على هذه السياسة' : 'Changes to This Policy',
      content: language === 'ar'
        ? 'قد نقوم بتحديث هذه السياسة من وقت لآخر. سيتم إخطارك بأي تغييرات جوهرية عبر التطبيق أو البريد الإلكتروني.'
        : 'We may update this policy from time to time. You will be notified of any material changes via the app or email.'
    },
    {
      key: 'contact',
      title: language === 'ar' ? 'اتصل بنا' : 'Contact Us',
      content: language === 'ar'
        ? 'إذا كان لديك أي أسئلة حول سياسة الخصوصية، يرجى التواصل معنا عبر البريد الإلكتروني: support@wasselny.app'
        : 'If you have any questions about this Privacy Policy, please contact us at: support@wasselny.app'
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header 
        title={language === 'ar' ? 'سياسة الخصوصية' : 'Privacy Policy'} 
        showProfileImage={false} 
        showSideMenu={false}
      />
      
      {loading ? (
        <PrivacyPolicySkeleton />
      ) : (
        <ScrollView className="flex-1 px-4 py-6">
          <View className="space-y-8">
            {sections.map(section => (
              <View key={section.key} className="space-y-2">
                <Text className={`text-xl ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} text-orange-600`}>{section.title}</Text>
                <Text className={`text-base ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-700 leading-7`}>{section.content}</Text>
              </View>
            ))}
            <View className="pt-4 border-t border-gray-200">
              <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-500`}>
                {language === 'ar' 
                  ? 'آخر تحديث: 1 مارس 2024'
                  : 'Last Updated: March 1, 2024'}
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
} 