import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
  Platform,
  Dimensions,
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
} from "react-native";
import StepIndicator from "react-native-step-indicator";
import GoogleTextInput from "@/components/GoogleTextInput";
import { icons, images } from "@/constants";
import DateTimePicker from "@react-native-community/datetimepicker";
import ReactNativeModal from "react-native-modal";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useLocationStore } from "@/store";
import { doc, setDoc, getDocs, collection, query, orderBy, limit, where, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useLanguage } from '@/context/LanguageContext';
import { MaterialIcons } from '@expo/vector-icons';
import Header from "./Header";
import { Circle, Svg } from 'react-native-svg';


interface Location {
  latitude: number;
  longitude: number;
  address: string;
}

interface Waypoint {
  address: string;
  latitude: number;
  longitude: number;
}

interface RideRequestData {
  origin_address: string;
  destination_address: string;
  origin_latitude: number;
  origin_longitude: number;
  destination_latitude: number;
  destination_longitude: number;
  destination_street: string;
  origin_street: string;
  waypoints: {
    address: string;
    latitude: number;
    longitude: number;
  }[];
  ride_datetime: string;
  ride_days: string[];
  required_gender: string;
  available_seats: number;
  no_smoking: boolean;
  no_children: boolean;
  no_music: boolean;
  driver_id: string;
  user_id: string;
  is_recurring: boolean;
  status: string;
  created_at: Date;
  ride_number: number;
}

interface CarInfo {
  seats: number;
  model: string;
  color: string;
}

type Step0Item = {
  type: 'start' | 'waypoint' | 'addButton' | 'destination';
  index?: number;
  waypoint?: Waypoint;
};

const stepIndicatorStyles = {
  stepIndicatorSize: 40,
  currentStepIndicatorSize: 50,
  separatorStrokeWidth: 4,
  currentStepStrokeWidth: 6,
  stepStrokeCurrentColor: "#f97316",
  separatorFinishedColor: "#f97316",
  separatorUnFinishedColor: "#d1d5db",
  stepIndicatorFinishedColor: "#f97316",
  stepIndicatorUnFinishedColor: "#d1d5db",
  stepIndicatorCurrentColor: "#ffffff",
  stepIndicatorLabelFontSize: 16,
  currentStepIndicatorLabelFontSize: 16,
  stepIndicatorLabelCurrentColor: "#f97316",
  stepIndicatorLabelFinishedColor: "#ffffff",
  stepIndicatorLabelUnFinishedColor: "#6b7280",
  labelColor: "#6b7280",
  labelSize: 16,
  currentStepLabelColor: "#f97316",
  labelAlign: "center",
};

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: 'success' | 'error' | 'warning' | 'info';
}

const screenHeight = Dimensions.get('screen').height;

const CustomAlert = ({ 
  visible, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  confirmText = 'نعم', 
  cancelText = 'لا',
  type = 'info'
}: CustomAlertProps) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 7
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true
        })
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 7
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true
        })
      ]).start();
    }
  }, [visible]);

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          icon: 'check-circle' as IconName,
          color: '#22c55e',
          bgColor: '#dcfce7'
        };
      case 'error':
        return {
          icon: 'error' as IconName,
          color: '#ef4444',
          bgColor: '#fee2e2'
        };
      case 'warning':
        return {
          icon: 'warning' as IconName,
          color: '#f97316',
          bgColor: '#ffedd5'
        };
      default:
        return {
          icon: 'info' as IconName,
          color: '#3b82f6',
          bgColor: '#dbeafe'
        };
    }
  };

  const typeStyles = getTypeStyles();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel}
    >
      <View className="flex-1 justify-center items-center bg-black/50">
        <Animated.View 
          className="w-[85%] bg-white rounded-2xl overflow-hidden"
          style={{
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim
          }}
        >
          <View className={`p-6 ${typeStyles.bgColor}`}>
            <View className="items-center mb-4">
              <MaterialIcons name={typeStyles.icon} size={48} color={typeStyles.color} />
            </View>
            <Text className="text-xl font-CairoBold text-gray-800 text-center mb-2">
              {title}
            </Text>
            <Text className="text-base text-gray-600 text-center font-CairoRegular">
              {message}
            </Text>
          </View>
          
          <View className="flex-row border-t border-gray-200">
            {onCancel && (
              <TouchableOpacity
                onPress={onCancel}
                className="flex-1 py-4 border-r border-gray-200"
              >
                <Text className="text-base text-gray-600 text-center font-CairoMedium">
                  {cancelText}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={onConfirm}
              className={`py-4 ${onCancel ? 'flex-1' : 'w-full'}`}
              style={{ backgroundColor: typeStyles.color }}
            >
              <Text className="text-base text-white text-center font-CairoMedium">
                {confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const RideCreationScreen = () => {
  const router = useRouter();
  const { user } = useUser();
  const { userId } = useAuth();
  const { language } = useLanguage();
  const isRTL = language === 'ar';
  const {
    userAddress,
    destinationAddress,
    userLatitude,
    userLongitude,
    destinationLatitude,
    destinationLongitude,
    setUserLocation,
    setDestinationLocation,
  } = useLocationStore();

  // Screen dimensions and insets
  const { width } = Dimensions.get("window");
  const insets = useSafeAreaInsets();

  // Translations for alert messages
  const translations = {
    ar: {
      error: "خطأ",
      timeConflict: "تعارض زمني",
      bookingFailed: "فشل الحجز",
      endDateError: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية",
      locationError: "يرجى إدخال موقع البداية والوجهة",
      dayError: "يرجى اختيار يوم الرحلة",
      dateError: "يرجى اختيار تاريخ الرحلة",
      timeError: "يرجى اختيار وقت الرحلة",
      dateFormatError: "تنسيق التاريخ غير صحيح، يجب أن يكون DD/MM/YYYY",
      timeFormatError: "تنسيق الوقت غير صحيح، يجب أن يكون HH:MM",
      invalidDateError: "تاريخ غير صالح",
      invalidTimeError: "وقت غير صالح",
      invalidDateTimeError: "تاريخ أو وقت غير صالح",
      futureDateTimeError: "يجب اختيار تاريخ ووقت في المستقبل",
      minimumTimeError: "يجب اختيار وقت بعد 30 دقيقة على الأقل من الآن",
      carInfoError: "لم يتم العثور على معلومات السيارة",
      seatsRequiredError: "يرجى إدخال عدد المقاعد",
      minSeatsError: "يجب أن يكون عدد المقاعد 1 على الأقل",
      maxSeatsError: (seats: number) => `لا يمكن تجاوز عدد مقاعد سيارتك (${seats} مقعد)`,
      genderError: "يرجى اختيار الجنس المطلوب",
      conflictError: "لديك رحلة مجدولة في نفس الوقت تقريبًا",
      bookingFailedError: "تعذر إتمام الحجز. حاول مرة أخرى.",
    },
    en: {
      error: "Error",
      timeConflict: "Time Conflict",
      bookingFailed: "Booking Failed",
      endDateError: "End date must be after start date",
      locationError: "Please enter start location and destination",
      dayError: "Please select a trip day",
      dateError: "Please select a trip date",
      timeError: "Please select a trip time",
      dateFormatError: "Invalid date format, must be DD/MM/YYYY",
      timeFormatError: "Invalid time format, must be HH:MM",
      invalidDateError: "Invalid date",
      invalidTimeError: "Invalid time",
      invalidDateTimeError: "Invalid date or time",
      futureDateTimeError: "Date and time must be in the future",
      minimumTimeError: "Time must be at least 30 minutes from now",
      carInfoError: "Car information not found",
      seatsRequiredError: "Please enter number of seats",
      minSeatsError: "Number of seats must be at least 1",
      maxSeatsError: (seats: number) => `Cannot exceed your car's seat capacity (${seats} seats)`,
      genderError: "Please select required gender",
      conflictError: "You have a ride scheduled at approximately the same time",
      bookingFailedError: "Unable to complete booking. Please try again.",
    }
  };
  
  const t = translations[language === 'ar' ? 'ar' : 'en'];

  // States
  const [currentStep, setCurrentStep] = useState(0);
  const [street, setStreet] = useState("");
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [tripDate, setTripDate] = useState("");
  const [tripTime, setTripTime] = useState("");
  const [availableSeats, setAvailableSeats] = useState("");
  const [selectedGender, setSelectedGender] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [isTimePickerVisible, setTimePickerVisible] = useState(false);
  const [rules, setRules] = useState({
    noSmoking: false,
    noChildren: false,
    noMusic: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [upcomingDates, setUpcomingDates] = useState<{[key: string]: string}>({});
  const [selectedDateRange, setSelectedDateRange] = useState<{
    startDate: Date | null;
    endDate: Date | null;
  }>({
    startDate: null,
    endDate: null,
  });
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [carInfo, setCarInfo] = useState<CarInfo | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [isAddingWaypoint, setIsAddingWaypoint] = useState(false);
  const [collapsedWaypoints, setCollapsedWaypoints] = useState<number[]>([]);
  const [startStreet, setStartStreet] = useState("");
  const [destinationStreet, setDestinationStreet] = useState("");
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    onConfirm: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    onConfirm: () => {},
  });

  // Animation states
  const [nextButtonScale] = useState(new Animated.Value(1));
  const [backButtonScale] = useState(new Animated.Value(1));

  // Translations for days, genders, and steps based on language
  const arabicDays = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
  const englishDays = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  
  const arabicGenders = ["ذكر", "أنثى", "كلاهما"];
  const englishGenders = ["Male", "Female", "Both"];
  
  const arabicSteps = ["المواقع", "تفاصيل الرحلة", "قوانين السيارة"];
  const englishSteps = ["Locations", "Trip Details", "Car Rules"];
  
  // Use the appropriate arrays based on language
  const days = language === 'ar' ? arabicDays : englishDays;
  const genders = language === 'ar' ? arabicGenders : englishGenders;
  const steps = language === 'ar' ? arabicSteps : englishSteps;

  // Animation handlers
  const animateButton = (scale: Animated.Value, callback: () => void) => {
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => callback());
  };

  // Handlers
  const handleFromLocation = useCallback(
    (location: Location) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setUserLocation({
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
      });
    },
    [setUserLocation]
  );

  const handleToLocation = useCallback(
    (location: Location) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setDestinationLocation({
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
      });
    },
    [setDestinationLocation]
  );

  const handleAddWaypoint = useCallback((location: Location) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWaypoints(prev => [...prev, {
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude
    }]);
    setIsAddingWaypoint(false);
  }, []);

  const handleRemoveWaypoint = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWaypoints(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleWaypointStreetChange = useCallback((index: number, street: string) => {
    setWaypoints(prev => prev.map((wp, i) => 
      i === index ? { ...wp, street } : wp
    ));
  }, []);

  const getDayOfWeek = (date: Date) => {
    const dayIndex = date.getDay();
    const arabicDaysMap = [1, 2, 3, 4, 5, 6, 0]; // Maps Sunday (0) to last position
    return days[arabicDaysMap[dayIndex]];
  };

  const formatDate = (date: Date): string => {
    return `${date.getDate().toString().padStart(2, "0")}/${(
      date.getMonth() + 1
    ).toString().padStart(2, "0")}/${date.getFullYear()}`;
  };

  const formatTime = (date: Date): string => {
    return `${date.getHours().toString().padStart(2, "0")}:${date
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  };

  const getNextOccurrence = (day: string, startDate: Date): Date => {
    const dayIndex = days.indexOf(day);
    const currentDay = startDate.getDay();
    
    // Map the current day to match our Arabic days array
    const arabicDaysMap = [1, 2, 3, 4, 5, 6, 0]; // Maps Sunday (0) to last position
    const currentDayIndex = arabicDaysMap.indexOf(currentDay);
    
    // Calculate days until next occurrence
    let daysUntilNext = dayIndex - currentDayIndex;
    if (daysUntilNext <= 0) {
      daysUntilNext += 7; // If the day has passed this week, get next week's occurrence
    }
    
    const nextDate = new Date(startDate);
    nextDate.setDate(startDate.getDate() + daysUntilNext - 2); // Subtract 2 days from the calculated date
    return nextDate;
  };

  const calculateUpcomingDates = useCallback((startDate: Date, selectedDays: string[]) => {
    const dates: {[key: string]: string} = {};
    
    selectedDays.forEach(day => {
      const nextDate = getNextOccurrence(day, startDate);
      dates[day] = formatDate(nextDate);
    });
    
    return dates;
  }, [days]);

  const radius = 29;
const strokeWidth = 5;
const normalizedRadius = radius - strokeWidth / 2;
const circumference = 2 * Math.PI * normalizedRadius;

const progress = (currentStep + 1) / steps.length;
const strokeDashoffset = circumference - progress * circumference;

  const handleDateConfirm = useCallback(
    (date: Date) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      // Get the day of the selected date
      const selectedDayOfWeek = getDayOfWeek(date);
      
      // Set the selected day
      setSelectedDay(selectedDayOfWeek);
      
      if (isRecurring) {
        if (!selectedDateRange.startDate) {
          setSelectedDateRange(prev => ({ ...prev, startDate: date }));
          setTripDate(formatDate(date));
        } else {
          if (date < selectedDateRange.startDate) {
            Alert.alert(t.error, t.endDateError);
            return;
          }
          setSelectedDateRange(prev => ({ ...prev, endDate: date }));
          
          // Calculate all dates between start and end date for the selected day
          const dates: Date[] = [];
          let currentDate = new Date(selectedDateRange.startDate);
          while (currentDate <= date) {
            const dayOfWeek = getDayOfWeek(currentDate);
            if (dayOfWeek === selectedDayOfWeek) {
              dates.push(new Date(currentDate));
            }
            currentDate.setDate(currentDate.getDate() + 1);
          }
          setSelectedDates(dates);
        }
      } else {
        setTripDate(formatDate(date));
        setSelectedDateRange({
          startDate: date,
          endDate: date
        });
        setSelectedDates([date]);
      }
      
      // Calculate upcoming dates for the selected day
      const dates = calculateUpcomingDates(date, [selectedDayOfWeek]);
      setUpcomingDates(dates);
      
      setDatePickerVisible(false);
    },
    [isRecurring, calculateUpcomingDates, selectedDateRange, t]
  );

  const handleTimeConfirm = useCallback((time: Date) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const hours = time.getHours().toString().padStart(2, "0");
    const minutes = time.getMinutes().toString().padStart(2, "0");
    setTripTime(`${hours}:${minutes}`);
    setTimePickerVisible(false);
  }, []);

  const handleSeatsChange = useCallback((text: string) => {
    const numericValue = text.replace(/[^0-9]/g, "");
    const maxSeats = carInfo?.seats || 25;
    
    // If the input is empty, allow it (for backspace functionality)
    if (numericValue === "") {
      setAvailableSeats("");
      return;
    }
    
    const seatsNumber = parseInt(numericValue);
    
    // Strict validation
    if (seatsNumber > maxSeats) {
      Alert.alert(
        language === 'ar' ? "تنبيه" : "Alert",
        t.maxSeatsError(maxSeats)
      );
      setAvailableSeats(maxSeats.toString());
      return;
    }
    
    setAvailableSeats(numericValue);
  }, [carInfo, t]);

  const toggleRule = useCallback((rule: keyof typeof rules) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRules((prev) => ({
      ...prev,
      [rule]: !prev[rule],
    }));
  }, []);

  const toggleDaySelection = useCallback((day: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // If the day is already selected, do nothing
    if (selectedDay === day) return;
    
    // Set the new selected day
    setSelectedDay(day);
    
    // If we have a start date, update the date to the next occurrence of the selected day
    if (selectedDateRange.startDate) {
      const nextDate = getNextOccurrence(day, selectedDateRange.startDate);
      
      if (isRecurring) {
        // For recurring rides, update the dates array
        if (selectedDateRange.endDate) {
          const dates: Date[] = [];
          let currentDate = new Date(selectedDateRange.startDate);
          while (currentDate <= selectedDateRange.endDate) {
            const dayOfWeek = getDayOfWeek(currentDate);
            if (dayOfWeek === day) {
              dates.push(new Date(currentDate));
            }
            currentDate.setDate(currentDate.getDate() + 1);
          }
          setSelectedDates(dates);
        }
      } else {
        // For non-recurring rides, update the single date
        setTripDate(formatDate(nextDate));
        setSelectedDateRange({
          startDate: nextDate,
          endDate: nextDate
        });
        setSelectedDates([nextDate]);
      }
      
      // Update upcoming dates
      const dates = calculateUpcomingDates(nextDate, [day]);
      setUpcomingDates(dates);
    }
  }, [selectedDateRange, calculateUpcomingDates, isRecurring, selectedDay, t]);

  const toggleRecurring = useCallback((value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsRecurring(value);
    
    // If switching to non-recurring and we have a date selected,
    // only keep the day of that date
    if (!value && selectedDateRange.startDate) {
      const dayOfWeek = getDayOfWeek(selectedDateRange.startDate);
      setSelectedDay(dayOfWeek);
    }
  }, [selectedDateRange, t]);

  const showAlert = (config: typeof alertConfig) => {
    setAlertConfig({
      ...config,
      confirmText: config.confirmText || (language === 'ar' ? 'حسناً' : 'OK'),
      cancelText: config.cancelText || (language === 'ar' ? 'إلغاء' : 'Cancel')
    });
  };

  const validateForm = useCallback(() => {
    if (currentStep === 0) {
      if (!userAddress || !destinationAddress) {
        showAlert({
          visible: true,
          title: language === 'ar' ? "تنبيه" : "Alert",
          message: language === 'ar' ? "يرجى إدخال نقطة البداية والوجهة" : "Please enter starting point and destination",
          type: 'warning',
          onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false }))
        });
        return false;
      }
    } else if (currentStep === 1) {
      // Validate day selection
      if (!selectedDay) {
        showAlert({
          visible: true,
          title: language === 'ar' ? "تنبيه" : "Alert",
          message: language === 'ar' ? "يرجى اختيار يوم الرحلة" : "Please select a trip day",
          type: 'warning',
          onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false }))
        });
        return false;
      }

      // Validate date
      if (!isRecurring && !tripDate) {
        showAlert({
          visible: true,
          title: language === 'ar' ? "تنبيه" : "Alert",
          message: language === 'ar' ? "يرجى اختيار تاريخ الرحلة" : "Please select a trip date",
          type: 'warning',
          onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false }))
        });
        return false;
      }

      // Validate time
      if (!tripTime) {
        showAlert({
          visible: true,
          title: language === 'ar' ? "تنبيه" : "Alert",
          message: language === 'ar' ? "يرجى اختيار وقت الرحلة" : "Please select a trip time",
          type: 'warning',
          onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false }))
        });
        return false;
      }

      // Validate seats
      if (!carInfo) {
        showAlert({
          visible: true,
          title: language === 'ar' ? "تنبيه" : "Alert",
          message: language === 'ar' ? "لم يتم العثور على معلومات السيارة" : "Car information not found",
          type: 'error',
          onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false }))
        });
        return false;
      }

      if (!availableSeats || isNaN(parseInt(availableSeats))) {
        showAlert({
          visible: true,
          title: language === 'ar' ? "تنبيه" : "Alert",
          message: language === 'ar' ? "يرجى إدخال عدد المقاعد" : "Please enter number of seats",
          type: 'warning',
          onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false }))
        });
        return false;
      }

      const seatsNumber = parseInt(availableSeats);
      if (seatsNumber < 1) {
        showAlert({
          visible: true,
          title: language === 'ar' ? "تنبيه" : "Alert",
          message: language === 'ar' ? "يجب أن يكون عدد المقاعد 1 على الأقل" : "Number of seats must be at least 1",
          type: 'warning',
          onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false }))
        });
        return false;
      }

      if (seatsNumber > (carInfo?.seats || 25)) {
        showAlert({
          visible: true,
          title: language === 'ar' ? "تنبيه" : "Alert",
          message: language === 'ar' 
            ? `لا يمكن تجاوز عدد مقاعد سيارتك (${carInfo?.seats || 25} مقعد)`
            : `Cannot exceed your car's seat capacity (${carInfo?.seats || 25} seats)`,
          type: 'warning',
          onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false }))
        });
        return false;
      }

      // Validate gender
      if (!selectedGender) {
        showAlert({
          visible: true,
          title: language === 'ar' ? "تنبيه" : "Alert",
          message: language === 'ar' ? "يرجى اختيار الجنس المطلوب" : "Please select required gender",
          type: 'warning',
          onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false }))
        });
        return false;
      }
    }
    return true;
  }, [
    currentStep,
    userAddress,
    destinationAddress,
    selectedDay,
    tripDate,
    tripTime,
    availableSeats,
    selectedGender,
    isRecurring,
    carInfo,
    language
  ]);

  const resetForm = useCallback(() => {
    setCurrentStep(0);
    setStartStreet("");
    setDestinationStreet("");
    setSelectedDay("");
    setTripDate("");
    setTripTime("");
    setAvailableSeats("");
    setSelectedGender("");
    setIsRecurring(false);
    setRules({
      noSmoking: false,
      noChildren: false,
      noMusic: false,
    });
    setSelectedDateRange({
      startDate: null,
      endDate: null,
    });
    setSelectedDates([]);
    setUpcomingDates({});
    setWaypoints([]);
  }, []);

  useEffect(() => {
    return () => {
      resetForm();
    };
  }, [resetForm]);

  const handleSuccessModalClose = useCallback(() => {
    setSuccess(false);
    resetForm();
    router.push("/(root)/(tabs)/home");
  }, [resetForm, router]);

  const handleConfirmRide = useCallback(async () => {
    setIsLoading(true);
    try {
      if (!validateForm()) {
        setIsLoading(false);
        return;
      }

      if (!userAddress || !destinationAddress || !user?.id) {
        throw new Error(language === 'ar' ? "بيانات الموقع غير مكتملة" : "Location data is incomplete");
      }

      if (!userLatitude || !userLongitude || !destinationLatitude || !destinationLongitude) {
        throw new Error(language === 'ar' ? "إحداثيات الموقع غير صالحة" : "Location coordinates are invalid");
      }

      if (!tripDate || !tripTime) {
        throw new Error(language === 'ar' ? "تاريخ أو وقت الرحلة غير محدد" : "Trip date or time is not specified");
      }

      // Additional seat validation
      if (!carInfo || parseInt(availableSeats) > carInfo.seats) {
        throw new Error(language === 'ar' 
          ? `لا يمكن تجاوز عدد مقاعد سيارتك (${carInfo?.seats || 25} مقعد)`
          : `Cannot exceed your car's seat capacity (${carInfo?.seats || 25} seats)`);
      }

      // Parse date and time
      const [day, month, year] = tripDate.split("/").map(Number);
      const [hours, minutes] = tripTime.split(":").map(Number);

      // Validate date and time components
      if (isNaN(day) || isNaN(month) || isNaN(year) || isNaN(hours) || isNaN(minutes)) {
        throw new Error(language === 'ar' ? "تنسيق التاريخ أو الوقت غير صالح" : "Invalid date or time format");
      }

      // Create date object
      const selectedDate = new Date(year, month - 1, day, hours, minutes);
      if (isNaN(selectedDate.getTime())) {
        throw new Error(language === 'ar' ? "تاريخ أو وقت غير صالح" : "Invalid date or time");
      }

      // Validate future date
      const now = new Date();
      if (selectedDate <= now) {
        throw new Error(language === 'ar' ? "يجب اختيار تاريخ ووقت في المستقبل" : "Date and time must be in the future");
      }

      const rideDateTimeStr = `${tripDate} ${tripTime}`;
      console.log("Creating ride with:", { tripDate, tripTime, rideDateTimeStr });

      const ridesRef = collection(db, "rides");
      const conflictQuery = query(
        ridesRef,
        where("driver_id", "==", user.id),
        where("status", "in", ["available", "active"])
      );
      const conflictSnapshot = await getDocs(conflictQuery);
      let hasConflict = false;
      const fifteenMinutes = 15 * 60 * 1000;

      conflictSnapshot.forEach((doc) => {
        const existingRide = doc.data();
        const existingRideDateStr = existingRide.ride_datetime;
        if (!existingRideDateStr) return;

        const [exDatePart, exTimePart] = existingRideDateStr.split(" ");
        const [exDay, exMonth, exYear] = exDatePart.split("/").map(Number);
        const [exHours, exMinutes] = exTimePart.split(":").map(Number);
        const existingRideDate = new Date(exYear, exMonth - 1, exDay, exHours, exMinutes);
        
        if (isNaN(existingRideDate.getTime())) return;
        
        const timeDiff = selectedDate.getTime() - existingRideDate.getTime();
        if (Math.abs(timeDiff) < fifteenMinutes) {
          hasConflict = true;
        }
      });

      if (hasConflict) {
        Alert.alert(
          language === 'ar' ? "تعارض زمني" : "Time Conflict", 
          language === 'ar' ? "لديك رحلة مجدولة في نفس الوقت تقريبًا" : "You have a ride scheduled at approximately the same time"
        );
        setIsLoading(false);
        return;
      }

      const q = query(ridesRef, orderBy("ride_number", "desc"), limit(1));
      const querySnapshot = await getDocs(q);
      let nextRideNumber = 1;
      if (!querySnapshot.empty) {
        const latestRide = querySnapshot.docs[0].data();
        nextRideNumber = (latestRide.ride_number || 0) + 1;
      }

      // Validate waypoints
      const validatedWaypoints = waypoints.map((waypoint, index) => {
        if (!waypoint.address) {
          throw new Error(language === 'ar' 
            ? `نقطة المرور ${index + 1}: العنوان غير مكتمل`
            : `Waypoint ${index + 1}: Address is incomplete`);
        }
        if (!waypoint.latitude || !waypoint.longitude) {
          throw new Error(language === 'ar'
            ? `نقطة المرور ${index + 1}: إحداثيات الموقع غير صالحة`
            : `Waypoint ${index + 1}: Location coordinates are invalid`);
        }
        return {
          address: waypoint.address,
          latitude: waypoint.latitude,
          longitude: waypoint.longitude
        };
      });

      const rideData: RideRequestData = {
        origin_address: userAddress,
        destination_address: destinationAddress,
        origin_latitude: userLatitude,
        origin_longitude: userLongitude,
        destination_latitude: destinationLatitude,
        destination_longitude: destinationLongitude,
        destination_street: destinationStreet || "",
        origin_street: startStreet || "",
        waypoints: validatedWaypoints,
        ride_datetime: rideDateTimeStr,
        ride_days: [selectedDay],
        required_gender: selectedGender,
        available_seats: parseInt(availableSeats),
        no_smoking: rules.noSmoking,
        no_children: rules.noChildren,
        no_music: rules.noMusic,
        driver_id: user.id,
        user_id: user.id,
        is_recurring: isRecurring,
        status: "available",
        created_at: new Date(),
        ride_number: nextRideNumber,
      };

      const rideRef = doc(db, "rides", nextRideNumber.toString());
      await setDoc(rideRef, rideData);
      setSuccess(true);
      resetForm();
    } catch (error: any) {
      console.error("خطأ في الحجز:", {
        error: error.message,
        tripDate,
        tripTime,
      });
      Alert.alert("فشل الحجز", error.message || "تعذر إتمام الحجز. حاول مرة أخرى.");
    } finally {
      setIsLoading(false);
    }
  }, [
    userAddress,
    destinationAddress,
    userLatitude,
    userLongitude,
    destinationLatitude,
    destinationLongitude,
    destinationStreet,
    startStreet,
    tripDate,
    tripTime,
    selectedDay,
    selectedGender,
    availableSeats,
    rules,
    isRecurring,
    user,
    carInfo,
    resetForm,
    waypoints,
    t
  ]);

  const handleNext = () => {
    if (validateForm()) {
      if (currentStep === steps.length - 1) {
        // If we're on the last step, confirm the ride
        handleConfirmRide();
      } else {
        // Otherwise, move to next step
        setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
      }
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleAddWaypointPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWaypoints(prev => [...prev, {
      address: "",
      latitude: 0,
      longitude: 0
    }]);
  }, []);

  const handleToggleWaypointCollapse = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCollapsedWaypoints(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  }, []);

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        const step0Data: Step0Item[] = [
          { type: 'start' },
          ...waypoints.map((waypoint, index) => ({
            type: 'waypoint' as const,
            index,
            waypoint,
          })),
          { type: 'addButton' },
          { type: 'destination' },
        ];

        return (
          <FlatList
            data={step0Data}
            renderItem={renderStep0Item}
            keyExtractor={(item, index) => `${item.type}-${index}`}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 100, // Add padding for bottom buttons
            }}
            keyboardShouldPersistTaps="handled"
          />
        );
      case 1:
        return (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 100, // Add padding for bottom buttons
            }}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View>
                <View className="w-full">
                  <View className="mb-3">
                    <Text className={`text-lg font-CairoBold ${isRTL ? 'text-right' : 'text-left'} pt-5 mb-2 text-gray-800`}>
                      {isRecurring 
                        ? (language === 'ar' ? "تاريخ بداية الرحلة" : "Trip Start Date") 
                        : (language === 'ar' ? "تاريخ الرحلة" : "Trip Date")}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowDatePicker(true)}
                      activeOpacity={0.7}
                    >
                      <View 
                        className="bg-white rounded-xl border border-gray-100 p-3 flex-row items-center justify-between shadow-sm"
                        style={{
                          elevation: Platform.OS === "android" ? 6 : 0,
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.15,
                          shadowRadius: 3,
                          overflow: "visible",
                        }}
                      >
                        <Text className={`flex-1 ${isRTL ? 'text-right' : 'text-left'} text-gray-700 font-CairoRegular`}>
                          {selectedDateRange.startDate 
                            ? formatDate(selectedDateRange.startDate) 
                            : (language === 'ar' ? "اختر التاريخ" : "Choose date")}
                        </Text>
                        <Image source={icons.calendar} className="w-5 h-5" />
                      </View>
                    </TouchableOpacity>
                  </View>
                  {showDatePicker && (
                    <DateTimePicker
                      value={selectedDateRange.startDate || new Date()}
                      mode="date"
                      display="spinner"
                      minimumDate={new Date()}
                      onChange={(event, date) => {
                        setShowDatePicker(false);
                        if (date) handleDateConfirm(date);
                      }}
                    />
                  )}
                  <View className="mb-3">
                    <Text className={`text-lg font-CairoBold ${isRTL ? 'text-right' : 'text-left'} mb-2 text-gray-800`}>
                      {language === 'ar' ? "وقت الرحلة" : "Trip Time"}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowTimePicker(true)}
                      activeOpacity={0.7}
                    >
                      <View 
                        className="bg-white rounded-xl border border-gray-100 p-3 flex-row items-center justify-between shadow-sm"
                        style={{
                          elevation: Platform.OS === "android" ? 6 : 0,
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.15,
                          shadowRadius: 3,
                          overflow: "visible",
                        }}
                      >
                        <Text className={`flex-1 ${isRTL ? 'text-right' : 'text-left'} text-gray-700 font-CairoRegular`}>
                          {tripTime || (language === 'ar' ? "اختر الوقت" : "Choose time")}
                        </Text>
                        <Image source={icons.clock} className="w-5 h-5" />
                      </View>
                    </TouchableOpacity>
                  </View>
                  {showTimePicker && (
                    <DateTimePicker
                      value={selectedDateRange.startDate || new Date()}
                      mode="time"
                      display="spinner"
                      onChange={(event, date) => {
                        setShowTimePicker(false);
                        if (date) handleTimeConfirm(date);
                      }}
                    />
                  )}
                  <View className="mb-3">
                    <Text className={`text-lg font-CairoBold ${isRTL ? 'text-right' : 'text-left'} mb-2 text-gray-800`}>
                      {language === 'ar' ? "حدد أيام الرحلة" : "Select Trip Days"}
                    </Text>
                    <View className="flex-row flex-wrap justify-between">
                      {days.map(renderDayButton)}
                    </View>
                  </View>
                  <View className="mb-3">
                    <Text className={`text-lg font-CairoBold ${isRTL ? 'text-right' : 'text-left'} mb-2 text-gray-800`}>
                      {language === 'ar' ? "عدد المقاعد المتاحة" : "Available Seats"}
                    </Text>
                    <View className="bg-white rounded-xl border border-gray-100 p-1 shadow-sm"
                      style={{
                        elevation: Platform.OS === "android" ? 6 : 0,
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.15,
                        shadowRadius: 3,
                        overflow: "visible",
                      }}
                    >
                      <TextInput
                        className={`${isRTL ? 'text-right' : 'text-left'} font-CairoRegular text-gray-700`}
                        value={availableSeats}
                        onChangeText={handleSeatsChange}
                        placeholder={language === 'ar' 
                          ? `حدد عدد المقاعد (1-${carInfo?.seats || 25})` 
                          : `Specify number of seats (1-${carInfo?.seats || 25})`
                        }
                        placeholderTextColor="#9CA3AF"
                        keyboardType="numeric"
                        autoCorrect={false}
                        autoCapitalize="none"
                        maxLength={2}
                        textAlign={isRTL ? 'right' : 'left'}
                      />
                    </View>
                    {carInfo && (
                      <Text className={`text-sm text-gray-500 ${isRTL ? 'text-right' : 'text-left'} mt-1 font-CairoRegular`}>
                        {language === 'ar' 
                          ? `عدد مقاعد سيارتك: ${carInfo.seats || 25} مقعد` 
                          : `Your car seats: ${carInfo.seats || 25} seats`
                        }
                      </Text>
                    )}
                  </View>
                  <View className="mb-3">
                    <Text className={`text-lg font-CairoBold ${isRTL ? 'text-right' : 'text-left'} mb-2 text-gray-800`}>
                      {language === 'ar' ? "الجنس المطلوب" : "Required Gender"}
                    </Text>
                    <View className="flex-row flex-wrap justify-between">
                      {genders.map((gender) => (
                        <TouchableOpacity
                          key={gender}
                          className={`p-3 mb-2 rounded-xl border ${
                            selectedGender === gender
                              ? "bg-orange-500 border-orange-500"
                              : "bg-white border-gray-100"
                          }`}
                          style={{
                            width: "30%",
                            elevation: Platform.OS === "android" ? 6 : 0,
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.15,
                            shadowRadius: 3,
                            overflow: "visible",
                          }}
                          onPress={() => {
                            setSelectedGender(gender);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text
                            className={`text-center font-CairoRegular ${
                              selectedGender === gender ? "text-white" : "text-gray-700"
                            }`}
                          >
                            {gender}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View className="mb-3">
                    <Text className={`text-lg font-CairoBold ${isRTL ? 'text-right' : 'text-left'} mb-2 text-gray-800`}>
                      {language === 'ar' ? "هل الرحلة متكررة؟" : "Is this a recurring trip?"}
                    </Text>
                    <View className="flex-row">
                      <TouchableOpacity
                        className={`p-3 mb-2 mr-2 rounded-xl border ${
                          isRecurring ? "bg-orange-500 border-orange-500" : "bg-white border-gray-100"
                        }`}
                        style={{
                          width: "49%",
                          elevation: Platform.OS === "android" ? 6 : 0,
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.15,
                          shadowRadius: 3,
                          overflow: "visible",
                        }}
                        onPress={() => toggleRecurring(true)}
                        activeOpacity={0.7}
                      >
                        <Text
                          className={`text-center font-CairoRegular ${
                            isRecurring ? "text-white" : "text-gray-700"
                          }`}
                        >
                          {language === 'ar' ? "نعم" : "Yes"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        className={`p-3 mb-2 ml-2 rounded-xl border ${
                          !isRecurring ? "bg-orange-500 border-orange-500" : "bg-white border-gray-100"
                        }`}
                        style={{
                          width: "49%",
                          elevation: Platform.OS === "android" ? 6 : 0,
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.15,
                          shadowRadius: 3,
                          overflow: "visible",
                        }}
                        onPress={() => toggleRecurring(false)}
                        activeOpacity={0.7}
                      >
                        <Text
                          className={`text-center font-CairoRegular ${
                            !isRecurring ? "text-white" : "text-gray-700"
                          }`}
                        >
                          {language === 'ar' ? "لا" : "No"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </ScrollView>
        );
      case 2:
        return (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 100, // Add padding for bottom buttons
            }}
            keyboardShouldPersistTaps="handled"
          >
            <View>
              <View className="w-full">
                <View className="mb-6">
                 
                  <Text className={`text-sm font-CairoRegular ${isRTL ? 'text-right' : 'text-left'} text-gray-500 leading-5`}>
                    {language === 'ar' 
                      ? "حدد القوانين التي تريد تطبيقها في رحلتك لضمان رحلة مريحة وآمنة"
                      : "Select the rules you want to apply in your trip to ensure a comfortable and safe journey"}
                  </Text>
                </View>

                <View className="space-y-3">
                  <TouchableOpacity
                    className={`flex-row ${isRTL ? 'flex-row-reverse' : 'flex-row'} justify-between items-center p-4 rounded-2xl border-2 ${
                      rules.noSmoking ? "bg-orange-50 border-orange-500" : "bg-white border-gray-100"
                    }`}
                    style={{
                      elevation: Platform.OS === "android" ? (rules.noSmoking ? 5 : 2) : 0,
                      shadowColor: rules.noSmoking ? "#f97316" : "#000",
                      shadowOffset: { width: 0, height: rules.noSmoking ? 3 : 1 },
                      shadowOpacity: rules.noSmoking ? 0.3 : 0.1,
                      shadowRadius: rules.noSmoking ? 4.65 : 1.0,
                      transform: [{ scale: rules.noSmoking ? 1.02 : 1 }],
                    }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      toggleRule("noSmoking");
                    }}
                    activeOpacity={0.7}
                  >
                    <View className={`flex-row ${isRTL ? 'flex-row-reverse' : 'flex-row'} items-center flex-1`}>
                      <View 
                        className={`w-10 h-10 rounded-xl ${isRTL ? 'ml-4' : 'mr-4'} justify-center items-center ${
                          rules.noSmoking ? "bg-orange-100" : "bg-gray-50"
                        }`}
                        style={{
                          elevation: Platform.OS === "android" ? 2 : 0,
                          shadowColor: rules.noSmoking ? "#f97316" : "#000",
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.1,
                          shadowRadius: 3,
                        }}
                      >
                        <Image 
                          source={icons.smoking} 
                          className={`w-5 h-5 ${rules.noSmoking ? "tint-orange-500" : "tint-gray-400"}`}
                        />
                      </View>
                      <View className="flex-1">
                        <Text
                          className={`text-base font-CairoBold ${isRTL ? 'text-right' : 'text-left'} ${
                            rules.noSmoking ? "text-orange-500" : "text-gray-800"
                          }`}
                        >
                          {language === 'ar' ? "بدون تدخين" : "No Smoking"}
                        </Text>
                        <Text
                          className={`text-xs font-CairoRegular mt-0.5 ${isRTL ? 'text-right' : 'text-left'} ${
                            rules.noSmoking ? "text-orange-400" : "text-gray-500"
                          }`}
                        >
                          {language === 'ar' 
                            ? "ممنوع التدخين في السيارة لضمان رحلة صحية"
                            : "Smoking is not allowed in the car for a healthy trip"}
                        </Text>
                      </View>
                    </View>
                    <View
                      className={`w-6 h-6 rounded-full border-2 justify-center items-center ${
                        rules.noSmoking ? "bg-orange-500 border-orange-500" : "border-gray-300"
                      }`}
                      style={{
                        elevation: Platform.OS === "android" ? 2 : 0,
                        shadowColor: rules.noSmoking ? "#f97316" : "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 3,
                      }}
                    >
                      {rules.noSmoking && (
                        <Image 
                          source={icons.checkmark} 
                          className="w-3.5 h-3.5 tint-white"
                        />
                      )}
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    className={`flex-row ${isRTL ? 'flex-row-reverse' : 'flex-row'} justify-between items-center p-4 rounded-2xl border-2 ${
                      rules.noChildren ? "bg-orange-50 border-orange-500" : "bg-white border-gray-100"
                    }`}
                    style={{
                      elevation: Platform.OS === "android" ? (rules.noChildren ? 5 : 2) : 0,
                      shadowColor: rules.noChildren ? "#f97316" : "#000",
                      shadowOffset: { width: 0, height: rules.noChildren ? 3 : 1 },
                      shadowOpacity: rules.noChildren ? 0.3 : 0.1,
                      shadowRadius: rules.noChildren ? 4.65 : 1.0,
                      transform: [{ scale: rules.noChildren ? 1.02 : 1 }],
                    }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      toggleRule("noChildren");
                    }}
                    activeOpacity={0.7}
                  >
                    <View className={`flex-row ${isRTL ? 'flex-row-reverse' : 'flex-row'} items-center flex-1`}>
                      <View 
                        className={`w-10 h-10 rounded-xl justify-center items-center ${isRTL ? 'ml-4' : 'mr-4'} ${
                          rules.noChildren ? "bg-orange-100" : "bg-gray-50"
                        }`}
                        style={{
                          elevation: Platform.OS === "android" ? 2 : 0,
                          shadowColor: rules.noChildren ? "#f97316" : "#000",
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.1,
                          shadowRadius: 3,
                        }}
                      >
                        <Image 
                          source={icons.children} 
                          className={`w-5 h-5 ${rules.noChildren ? "tint-orange-500" : "tint-gray-400"}`}
                        />
                      </View>
                      <View className="flex-1">
                        <Text
                          className={`text-base font-CairoBold ${isRTL ? 'text-right' : 'text-left'} ${
                            rules.noChildren ? "text-orange-500" : "text-gray-800"
                          }`}
                        >
                          {language === 'ar' ? "بدون أطفال" : "No Children"}
                        </Text>
                        <Text
                          className={`text-xs font-CairoRegular mt-0.5 ${isRTL ? 'text-right' : 'text-left'} ${
                            rules.noChildren ? "text-orange-400" : "text-gray-500"
                          }`}
                        >
                          {language === 'ar' 
                            ? "ممنوع اصطحاب الأطفال لضمان رحلة هادئة"
                            : "Children are not allowed to ensure a quiet trip"}
                        </Text>
                      </View>
                    </View>
                    <View
                      className={`w-6 h-6 rounded-full border-2 justify-center items-center ${
                        rules.noChildren ? "bg-orange-500 border-orange-500" : "border-gray-300"
                      }`}
                      style={{
                        elevation: Platform.OS === "android" ? 2 : 0,
                        shadowColor: rules.noChildren ? "#f97316" : "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 3,
                      }}
                    >
                      {rules.noChildren && (
                        <Image 
                          source={icons.checkmark} 
                          className="w-3.5 h-3.5 tint-white"
                        />
                      )}
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    className={`flex-row ${isRTL ? 'flex-row-reverse' : 'flex-row'} justify-between items-center p-4 rounded-2xl border-2 ${
                      rules.noMusic ? "bg-orange-50 border-orange-500" : "bg-white border-gray-100"
                    }`}
                    style={{
                      elevation: Platform.OS === "android" ? (rules.noMusic ? 5 : 2) : 0,
                      shadowColor: rules.noMusic ? "#f97316" : "#000",
                      shadowOffset: { width: 0, height: rules.noMusic ? 3 : 1 },
                      shadowOpacity: rules.noMusic ? 0.3 : 0.1,
                      shadowRadius: rules.noMusic ? 4.65 : 1.0,
                      transform: [{ scale: rules.noMusic ? 1.02 : 1 }],
                    }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      toggleRule("noMusic");
                    }}
                    activeOpacity={0.7}
                  >
                    <View className={`flex-row ${isRTL ? 'flex-row-reverse' : 'flex-row'} items-center flex-1`}>
                      <View 
                        className={`w-10 h-10 rounded-xl justify-center items-center ${isRTL ? 'ml-4' : 'mr-4'} ${
                          rules.noMusic ? "bg-orange-100" : "bg-gray-50"
                        }`}
                        style={{
                          elevation: Platform.OS === "android" ? 2 : 0,
                          shadowColor: rules.noMusic ? "#f97316" : "#000",
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.1,
                          shadowRadius: 3,
                        }}
                      >
                        <Image 
                          source={icons.music} 
                          className={`w-5 h-5 ${rules.noMusic ? "tint-orange-500" : "tint-gray-400"}`}
                        />
                      </View>
                      <View className="flex-1">
                        <Text
                          className={`text-base font-CairoBold ${isRTL ? 'text-right' : 'text-left'} ${
                            rules.noMusic ? "text-orange-500" : "text-gray-800"
                          }`}
                        >
                          {language === 'ar' ? "بدون أغاني" : "No Music"}
                        </Text>
                        <Text
                          className={`text-xs font-CairoRegular mt-0.5 ${isRTL ? 'text-right' : 'text-left'} ${
                            rules.noMusic ? "text-orange-400" : "text-gray-500"
                          }`}
                        >
                          {language === 'ar' 
                            ? "ممنوع تشغيل الموسيقى لضمان رحلة هادئة"
                            : "Music is not allowed to ensure a quiet trip"}
                        </Text>
                      </View>
                    </View>
                    <View
                      className={`w-6 h-6 rounded-full border-2 justify-center items-center ${
                        rules.noMusic ? "bg-orange-500 border-orange-500" : "border-gray-300"
                      }`}
                      style={{
                        elevation: Platform.OS === "android" ? 2 : 0,
                        shadowColor: rules.noMusic ? "#f97316" : "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 3,
                      }}
                    >
                      {rules.noMusic && (
                        <Image 
                          source={icons.checkmark} 
                          className="w-3.5 h-3.5 tint-white"
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
        );
      default:
        return null;
    }
  };

  // Update the day selection UI to show the next occurrence date
  const renderDayButton = (day: string) => {
    const isSelected = selectedDay === day;
    const nextDate = selectedDateRange.startDate ? getNextOccurrence(day, selectedDateRange.startDate) : null;
    
    return (
      <TouchableOpacity
        key={day}
        className={`p-3 mb-2 rounded-xl border ${
          isSelected
            ? "bg-orange-500 border-orange-500"
            : "bg-white border-gray-100"
        }`}
        style={{
          width: "30%",
          elevation: Platform.OS === "android" ? 4 : 0,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 3,
        }}
        onPress={() => toggleDaySelection(day)}
        activeOpacity={0.7}
      >
        <Text
          className={`text-center font-CairoRegular ${
            isSelected ? "text-white" : "text-gray-700"
          }`}
        >
          {day}
        </Text>
        {isSelected && nextDate && (
          <Text className="text-center text-white text-xs mt-1 font-CairoRegular">
            {formatDate(nextDate)}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderStep0Item = ({ item }: { item: Step0Item }) => {
    switch (item.type) {
      case 'start':
        return (
          <View className="my-4">
            <View className={`flex-row items-center mb-3 ${isRTL ? 'justify-end' : 'justify-start'}`}>
              <Text className={`text-lg font-CairoBold ${isRTL ? 'text-right' : 'text-left'} text-gray-800`}>
                {language === 'ar' ? "نقطة البداية" : "Starting Point"}
              </Text>
            </View>
            <View
             className="mb-3 bg-white rounded-xl border border-gray-100 shadow-sm"
             style={{
               elevation: Platform.OS === "android" ? 6 : 0,
               shadowColor: "#000",
               shadowOffset: { width: 0, height: 2 },
               shadowOpacity: 0.15,
               shadowRadius: 3,
               overflow: "visible",
             }}
            >
              <GoogleTextInput
                icon={icons.pin}
                initialLocation={userAddress || ""}
                containerStyle="bg-white rounded-xl"
                textInputBackgroundColor="#fff"
                handlePress={handleFromLocation}
                placeholder={language === 'ar' ? "أدخل نقطة البداية" : "Enter starting point"}
              />
            </View>
            <View className="mt-2">
              <Text className={`text-base font-CairoBold mb-2 ${isRTL ? 'text-right' : 'text-left'} text-gray-800`}>
                {language === 'ar' ? "شارع البداية" : "Starting Street"}
              </Text>
              <View
               className="flex-row items-center rounded-xl p-3 bg-white border border-gray-100 shadow-sm"
               style={{
                 elevation: Platform.OS === "android" ? 6 : 0,
                 shadowColor: "#000",
                 shadowOffset: { width: 0, height: 2 },
                 shadowOpacity: 0.15,
                 shadowRadius: 3,
                 overflow: "visible",
               }}
              >
                <Image source={icons.street} className={`w-7 h-7 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                <TextInput
                  value={startStreet}
                  onChangeText={setStartStreet}
                  placeholder={language === 'ar' ? "الشارع الذي ستبدأ منه رحلتك" : "The street you start your trip from"}
                  className={`flex-1 ${isRTL ? 'text-right mr-1 ml-2.5' : 'text-left ml-1 mr-2.5'} bg-transparent pt-1 pb-1 font-CairoBold placeholder:font-CairoBold`}
                  placeholderTextColor="#9CA3AF"
                  autoCorrect={false}
                  autoCapitalize="none"
                  textAlign={isRTL ? 'right' : 'left'}
                />
              </View>
            </View>
          </View>
        );
      case 'waypoint':
        const waypointNumber = item.index! + 1;
        return (
          <View className="my-4">
            <View className="flex-row justify-between items-center mb-3">
              {isRTL ? (
                // Arabic layout (X on right, number on left)
                <>
                  <View className="flex-row items-center">
                    <TouchableOpacity
                      onPress={() => handleRemoveWaypoint(item.index!)}
                      className="p-2 bg-red-50 rounded-lg mr-2"
                      activeOpacity={0.7}
                    >
                      <Image 
                        source={icons.close} 
                        className="w-5 h-5 tint-red-500"
                      />
                    </TouchableOpacity>
                  </View>
                  <View className="flex-row items-center justify-end">
                    <Text className="text-lg font-CairoBold text-right text-gray-800 ml-2">
                      {`نقطة مرور ${waypointNumber}`}
                    </Text>
                  </View>
                </>
              ) : (
                // English layout (number on left, X on right)
                <>
                  <View className="flex-row items-center">
                    <Text className="text-lg font-CairoBold text-left text-gray-800 mr-2">
                      {`Waypoint ${waypointNumber}`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleRemoveWaypoint(item.index!)}
                    className="p-2 bg-red-50 rounded-lg"
                    activeOpacity={0.7}
                  >
                    <Image 
                      source={icons.close} 
                      className="w-5 h-5 tint-red-500"
                    />
                  </TouchableOpacity>
                </>
              )}
            </View>
            <View
              className="mb-3 bg-white rounded-xl border border-gray-100 shadow-sm"
              style={{
                elevation: Platform.OS === "android" ? 6 : 0,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 3,
                overflow: "visible",
              }}
            >
              <GoogleTextInput
                icon={icons.target}  // Changed from map to target for waypoints
                initialLocation={item.waypoint?.address || ""}
                containerStyle="bg-white rounded-xl"
                textInputBackgroundColor="#fff"
                handlePress={(location) => {
                  if (item.waypoint) {
                    const updatedWaypoint: Waypoint = {
                      address: location.address,
                      latitude: location.latitude,
                      longitude: location.longitude
                    };
                    setWaypoints(prev => prev.map((wp, i) => 
                      i === item.index ? updatedWaypoint : wp
                    ));
                  }
                }}
                placeholder={language === 'ar' ? `أدخل نقطة مرور ${waypointNumber}` : `Enter waypoint ${waypointNumber}`}
              />
            </View>
          </View>
        );
      case 'addButton':
        return (
          <TouchableOpacity
            onPress={handleAddWaypointPress}
            className="flex-row items-center justify-center bg-orange-50 p-4 rounded-xl mt-4 mb-6 border-2 border-orange-100"
            activeOpacity={0.7}
          >
            <View className={`w-8 h-8 bg-orange-100 rounded-full justify-center items-center ${isRTL ? 'ml-4' : 'mr-4'}`}>
              <Image source={icons.add} className="w-4 h-4 tint-orange-500" />
            </View>
            <Text className="text-orange-500 pt-2 font-CairoBold text-base">
              {language === 'ar' ? "إضافة نقطة مرور" : "Add Waypoint"}
            </Text>
          </TouchableOpacity>
        );
      case 'destination':
        return (
          <View className="my-4">
            <View className={`flex-row items-center mb-3 ${isRTL ? 'justify-end' : 'justify-start'}`}>
              <Text className={`text-lg font-CairoBold ${isRTL ? 'text-right' : 'text-left'} text-gray-800`}>
                {language === 'ar' ? "الوجهة" : "Destination"}
              </Text>
            </View>
            <View
             className="mb-3 bg-white rounded-xl border border-gray-100 shadow-sm"
             style={{
               elevation: Platform.OS === "android" ? 6 : 0,
               shadowColor: "#000",
               shadowOffset: { width: 0, height: 2 },
               shadowOpacity: 0.15,
               shadowRadius: 3,
               overflow: "visible",
             }}
            >
              <GoogleTextInput
                icon={icons.target}  // Changed from map to target for destination
                initialLocation={destinationAddress || ""}
                containerStyle="bg-white rounded-xl"
                textInputBackgroundColor="#fff"
                handlePress={handleToLocation}
                placeholder={language === 'ar' ? "أدخل الوجهة" : "Enter destination"}
              />
            </View>
            <View className="mt-2">
              <Text className={`text-base font-CairoBold mb-2 ${isRTL ? 'text-right' : 'text-left'} text-gray-800`}>
                {language === 'ar' ? "شارع الوجهة" : "Destination Street"}
              </Text>
              <View
               className="flex-row items-center rounded-xl p-3 bg-white border border-gray-100 shadow-sm"
               style={{
                 elevation: Platform.OS === "android" ? 6 : 0,
                 shadowColor: "#000",
                 shadowOffset: { width: 0, height: 2 },
                 shadowOpacity: 0.15,
                 shadowRadius: 3,
                 overflow: "visible",
               }}
              >
                <Image source={icons.street} className={`w-7 h-7 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                <TextInput
                  value={destinationStreet}
                  onChangeText={setDestinationStreet}
                  placeholder={language === 'ar' ? "الشارع الذي ستنهي رحلتك فيه" : "The street you will end your trip in"}
                  className={`flex-1 ${isRTL ? 'text-right mr-1 ml-2.5' : 'text-left ml-1 mr-2.5'} bg-transparent pt-1 pb-1 font-CairoBold placeholder:font-CairoBold`}
                  placeholderTextColor="#9CA3AF"
                  autoCorrect={false}
                  autoCapitalize="none"
                  textAlign={isRTL ? 'right' : 'left'}
                />
              </View>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  useEffect(() => {
    const fetchCarInfo = async () => {
      if (!user?.id) return;
      
      try {
        const userDoc = await getDoc(doc(db, "users", user.id));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.driver && userData.driver.car_seats) {
            setCarInfo({
              seats: userData.driver.car_seats,
              model: userData.driver.car_model || "",
              color: userData.driver.car_color || ""
            });
          }
        }
      } catch (error) {
        console.error("Error fetching car info:", error);
      }
    };

    fetchCarInfo();
  }, [user?.id]);

  // Add state for new pickers
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header 
        title={language === 'ar' ? "إنشاء رحلة" : "Create Ride"} 
        showSideMenu={false}
        showProfileImage={false}
      />
      
      {/* Custom Alert */}
      <CustomAlert {...alertConfig} />

      <View className="px-4 py-4">
      <View className="flex-row items-center">
        <View className="w-16 h-16 mr-3 relative justify-center items-center">
          <Svg height="100%" width="100%" viewBox="0 0 64 64" className="absolute">
            <Circle
              stroke="#E5E7EB" // light gray background
              fill="none"
              cx="32"
              cy="32"
              r={normalizedRadius}
              strokeWidth={strokeWidth}
            />
            <Circle
              stroke="#F97316" // orange progress
              fill="none"
              cx="32"
              cy="32"
              r={normalizedRadius}
              strokeWidth={strokeWidth}
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              rotation="-90"
              origin="32,32"
            />
          </Svg>
          <View className="absolute inset-0 justify-center items-center">
            <Text className="text-orange-500 pt-1 text-lg font-CairoBold">
              {currentStep + 1}/{steps.length}
            </Text>
          </View>
        </View>

        <View className="flex pt-2">
          <Text className="text-2xl font-CairoBold text-gray-800">
            {steps[currentStep]}
          </Text>
          <Text className="text-base text-gray-500 font-CairoRegular">
            {currentStep < steps.length - 1
              ? `${language === 'ar' ? 'التالي' : 'Next'}: ${steps[currentStep + 1]}`
              : language === 'ar' ? 'الخطوة الأخيرة' : 'Final Step'}
          </Text>
        </View>
      </View>
    </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1">
          {renderStepContent()}
        </View>

        {/* Fixed Bottom Buttons */}
        <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4">
          <View className="flex-row justify-between">
            <Animated.View style={{ transform: [{ scale: backButtonScale }] }}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => animateButton(backButtonScale, handleBack)}
                disabled={isLoading || currentStep === 0}
              >
                <LinearGradient
                  colors={["#333333", "#333333"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    width: 160,
                    height: 60,
                    borderRadius: 30,
                    justifyContent: "center",
                    alignItems: "center",
                    elevation: Platform.OS === "android" ? 6 : 0,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.2,
                    shadowRadius: 3,
                    opacity: currentStep === 0 ? 0.5 : 1,
                  }}
                >
                  <View className="flex-row items-center justify-center">
                    <Text className="text-white font-CairoBold text-lg">
                      {language === 'ar' ? "السابق" : "Back"}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
            <Animated.View style={{ transform: [{ scale: nextButtonScale }] }}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => animateButton(nextButtonScale, handleNext)}
                disabled={isLoading}
              >
                <LinearGradient
                  colors={currentStep === steps.length - 1 ? ["#38A169", "#38A169"] : ["#f97316", "#ea580c"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    width: 160,
                    height: 60,
                    borderRadius: 30,
                    justifyContent: "center",
                    alignItems: "center",
                    elevation: Platform.OS === "android" ? 8 : 0,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 4.65,
                    opacity: isLoading ? 0.7 : 1,
                  }}
                >
                  <View className="flex-row items-center justify-center">
                    {isLoading && currentStep === steps.length - 1 ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <Text className="text-white font-CairoBold text-lg">
                        {currentStep === steps.length - 1
                          ? (language === 'ar' ? "انشاء الرحلة" : "Create Ride")
                          : (language === 'ar' ? "التالي" : "Next")}
                      </Text>
                    )}
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Success Modal */}
      <ReactNativeModal
        isVisible={success}
        animationIn="fadeIn"
        animationOut="fadeOut"
        backdropOpacity={0.5}
        deviceHeight={screenHeight}
        coverScreen={true}
  useNativeDriver={true}
  propagateSwipe={true}
        
        
      >
        <View className="bg-white rounded-2xl p-6 items-center">
          <Image source={images.check} className="w-16 h-16 mb-4" />
          <Text className="text-xl font-CairoBold text-gray-900 mb-2">
            {language === 'ar' ? "تم إنشاء الرحلة بنجاح!" : "Ride created successfully!"}
          </Text>
          <Text className="text-center text-gray-600 font-CairoRegular mb-6">
            {language === 'ar' 
              ? "يمكنك الآن رؤية رحلتك في صفحة الرحلات." 
              : "You can now see your ride in the rides page."}
          </Text>
          <TouchableOpacity
            onPress={() => {
              router.replace("/(root)/(tabs)/rides");
            }}
            className="w-full bg-orange-500 py-3 rounded-xl"
          >
            <Text className="text-white text-center font-CairoBold">
              {language === 'ar' ? "رؤية الرحلات" : "View Rides"}
            </Text>
          </TouchableOpacity>
        </View>
      </ReactNativeModal>
    </SafeAreaView>
  );
};

export default RideCreationScreen;