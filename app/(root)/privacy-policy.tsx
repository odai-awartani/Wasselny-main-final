import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import Header from '@/components/Header';

interface Section {
  key: string;
  title: string;
  content: string | React.ReactNode;
}

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
  const isRTL = language === 'ar';

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
  const sections: Section[] = [
    {
      key: 'introduction',
      title: isRTL ? 'مقدمة' : 'Introduction',
      content: isRTL
        ? 'مرحباً بك في سياسة الخصوصية لتطبيق وصلني. نحن نقدر خصوصيتك ونلتزم بحماية بياناتك الشخصية. يرجى قراءة هذه السياسة بعناية لفهم كيفية جمع واستخدام وحماية معلوماتك.'
        : "Welcome to Wasselni Privacy Policy. We value your privacy and are committed to protecting your personal data. Please read this policy carefully to understand how we collect, use, and protect your information."
    },
    {
      key: 'info-collect',
      title: isRTL ? 'المعلومات التي نجمعها' : 'Information We Collect',
      content: (
        <View className="space-y-2">
          {[
            isRTL ? '• البيانات الشخصية (مثل الاسم، البريد الإلكتروني، رقم الهاتف)' : '• Personal data (such as name, email, phone number)',
            isRTL ? '• بيانات الموقع الجغرافي' : '• Location data',
            isRTL ? '• بيانات الاستخدام (مثل تفاعلك مع التطبيق)' : '• Usage data (such as your interactions with the app)',
            isRTL ? '• بيانات الجهاز (مثل نوع الجهاز ونظام التشغيل)' : '• Device data (such as device type and OS)',
            isRTL ? '• ملفات تعريف الارتباط وتقنيات التتبع' : '• Cookies and tracking technologies'
          ].map((item, index) => (
            <Text key={index} className={`${isRTL ? 'text-right' : 'text-left'} font-CairoRegular`}>
              {item}
            </Text>
          ))}
        </View>
      )
    },
    {
      key: 'info-use',
      title: isRTL ? 'كيفية استخدام المعلومات' : 'How We Use Your Information',
      content: (
        <View className="space-y-2">
          {[
            isRTL ? '• تقديم خدمات التطبيق وتحسينها' : '• To provide and improve our services',
            isRTL ? '• تخصيص تجربتك' : '• To personalize your experience',
            isRTL ? '• التواصل معك بشأن التحديثات أو العروض' : '• To communicate with you about updates or offers',
            isRTL ? '• التحليل وتحسين الأداء' : '• For analytics and performance improvement',
            isRTL ? '• الامتثال للمتطلبات القانونية' : '• To comply with legal requirements'
          ].map((item, index) => (
            <Text key={index} className={`${isRTL ? 'text-right' : 'text-left'} font-CairoRegular`}>
              {item}
            </Text>
          ))}
        </View>
      )
    },
    {
      key: 'info-share',
      title: isRTL ? 'مشاركة المعلومات' : 'How We Share Your Information',
      content: (
        <View className="space-y-2">
          {[
            isRTL ? '• مع مزودي الخدمة (مثل خدمات الاستضافة والتحليلات)' : '• With service providers (such as hosting and analytics)',
            isRTL ? '• لأسباب قانونية أو استجابة للطلبات الحكومية' : '• For legal reasons or in response to government requests',
            isRTL ? '• بموافقتك الصريحة' : '• With your explicit consent',
            isRTL ? '• لا نبيع بياناتك لأي طرف ثالث' : '• We do not sell your data to third parties'
          ].map((item, index) => (
            <Text key={index} className={`${isRTL ? 'text-right' : 'text-left'} font-CairoRegular`}>
              {item}
            </Text>
          ))}
        </View>
      )
    },
    {
      key: 'security',
      title: isRTL ? 'أمان البيانات' : 'Data Security',
      content: isRTL
        ? 'نستخدم تقنيات وإجراءات أمان متقدمة لحماية بياناتك من الوصول أو الاستخدام غير المصرح به.'
        : 'We use advanced security technologies and procedures to protect your data from unauthorized access or use.'
    },
    {
      key: 'retention',
      title: isRTL ? 'الاحتفاظ بالبيانات' : 'Data Retention',
      content: isRTL
        ? 'نحتفظ ببياناتك فقط للمدة اللازمة لتحقيق الأغراض المذكورة في هذه السياسة أو كما يقتضي القانون.'
        : 'We retain your data only as long as necessary for the purposes described in this policy or as required by law.'
    },
    {
      key: 'rights',
      title: isRTL ? 'حقوق المستخدم' : 'User Rights',
      content: (
        <View className="space-y-2">
          {[
            isRTL ? '• الوصول إلى بياناتك' : '• Access your data',
            isRTL ? '• تصحيح أو تحديث بياناتك' : '• Correct or update your data',
            isRTL ? '• حذف حسابك' : '• Delete your account',
            isRTL ? '• الاعتراض أو تقييد معالجة بياناتك' : '• Object to or restrict processing',
            isRTL ? '• طلب نقل بياناتك' : '• Request data portability'
          ].map((item, index) => (
            <Text key={index} className={`${isRTL ? 'text-right' : 'text-left'} font-CairoRegular`}>
              {item}
            </Text>
          ))}
        </View>
      )
    },
    {
      key: 'children',
      title: isRTL ? 'خصوصية الأطفال' : "Children's Privacy",
      content: isRTL
        ? 'لا يُسمح للأطفال دون سن 18 باستخدام التطبيق دون موافقة ولي الأمر. إذا اكتشفنا جمع بيانات من طفل دون هذا السن، سنحذفها فوراً.'
        : "Our app is not intended for children under 18. If we learn we have collected data from a child under this age, we will delete it immediately."
    },
    {
      key: 'international',
      title: isRTL ? 'النقل الدولي للبيانات' : 'International Transfers',
      content: isRTL
        ? 'قد يتم نقل بياناتك ومعالجتها خارج بلدك. نحن نضمن حماية بياناتك وفقاً لهذه السياسة.'
        : 'Your data may be transferred and processed outside your country. We ensure your data is protected as described in this policy.'
    },
    {
      key: 'changes',
      title: isRTL ? 'تغييرات على هذه السياسة' : 'Changes to This Policy',
      content: isRTL
        ? 'قد نقوم بتحديث هذه السياسة من وقت لآخر. سيتم إخطارك بأي تغييرات جوهرية عبر التطبيق أو البريد الإلكتروني.'
        : 'We may update this policy from time to time. You will be notified of any material changes via the app or email.'
    },
    {
      key: 'contact',
      title: isRTL ? 'اتصل بنا' : 'Contact Us',
      content: isRTL
        ? 'إذا كان لديك أي أسئلة حول سياسة الخصوصية، يرجى التواصل معنا عبر البريد الإلكتروني: support@wasselni.app'
        : 'If you have any questions about this Privacy Policy, please contact us at: support@wasselni.app'
    }
  ];

  const renderContent = (content: string | React.ReactNode) => {
    if (typeof content === 'string') {
      return (
        <Text className={`text-base ${isRTL ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-700 leading-7`}>
          {content}
        </Text>
      );
    }
    return content;
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header 
        title={isRTL ? 'سياسة الخصوصية' : 'Privacy Policy'} 
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
                <Text className={`text-xl ${isRTL ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} text-orange-600`}>
                  {section.title}
                </Text>
                {renderContent(section.content)}
              </View>
            ))}
            <View className="pt-4 border-t border-gray-200">
              <Text className={`text-sm ${isRTL ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-500`}>
                {isRTL ? 'آخر تحديث: 1 مارس 2024' : 'Last Updated: March 1, 2024'}
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
} 