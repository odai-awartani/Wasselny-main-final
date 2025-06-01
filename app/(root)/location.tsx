import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Modal, TextInput, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import { useUser } from '@clerk/clerk-expo';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { collection, addDoc, getDocs, query, where, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { LinearGradient } from 'expo-linear-gradient';
import Header from '@/components/Header';
import Animated, { FadeIn } from 'react-native-reanimated';

interface SavedLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  isDefault: boolean;
  address?: string;
}

// Skeleton Loading Components
const MapSkeleton = () => (
  <View className="h-[280px] bg-gray-100 rounded-2xl overflow-hidden">
    <View className="w-full h-full bg-gray-200 animate-pulse">
      <View className="absolute top-4 left-4 w-8 h-8 bg-white rounded-full shadow-md" />
      <View className="absolute top-4 right-4 w-8 h-8 bg-white rounded-full shadow-md" />
      <View className="absolute bottom-4 left-1/2 transform -translate-x-1/2 w-12 h-12 bg-white rounded-full shadow-md" />
    </View>
  </View>
);

const ActionButtonSkeleton = () => (
  <View className="p-4">
    <View className="bg-gray-200 rounded-lg p-4 mb-4 h-14 animate-pulse" />
  </View>
);

const SavedLocationSkeleton = () => (
  <View className="p-4 mb-3 rounded-xl border border-gray-200 bg-white shadow-sm">
    <View className="flex-row items-center justify-between">
      <View className="flex-1">
        <View className="w-32 h-5 bg-gray-200 rounded-full animate-pulse mb-2" />
        <View className="w-48 h-4 bg-gray-200 rounded-full animate-pulse" />
      </View>
      <View className="w-7 h-7 rounded-full border-2 border-gray-200 animate-pulse" />
    </View>
  </View>
);

const LocationSkeleton = () => (
  <Animated.View entering={FadeIn} className="flex-1">
    <MapSkeleton />
    <ActionButtonSkeleton />
    <View className="flex-1 px-4">
      <View className="w-40 h-6 bg-gray-200 rounded-full animate-pulse mb-4" />
      {[1, 2, 3].map((_, index) => (
        <SavedLocationSkeleton key={index} />
      ))}
    </View>
  </Animated.View>
);

export default function LocationScreen() {
  const router = useRouter();
  const { language } = useLanguage();
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [buttonLoading, setButtonLoading] = useState<{
    saveLocation?: boolean;
    setDefault?: string;
    delete?: string;
  }>({});
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<SavedLocation | null>(null);
  const [showNameModal, setShowNameModal] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [locationAddresses, setLocationAddresses] = useState<{[key: string]: string}>({});
  const [mapRegion, setMapRegion] = useState({
    latitude: 31.9522,  // Center of Palestine
    longitude: 35.2332,
    latitudeDelta: 0.5,  // Closer zoom level
    longitudeDelta: 0.5,
  });

  // Add map boundaries for Palestine
  const palestineBounds = {
    north: 33.3,    // Northernmost point
    south: 31.2,    // Southernmost point
    east: 35.5,     // Easternmost point
    west: 34.2      // Westernmost point
  };

  // Get address from coordinates with retry mechanism
  const getAddressFromCoordinates = useCallback(async (latitude: number, longitude: number, retries = 3): Promise<string> => {
    for (let i = 0; i < retries; i++) {
      try {
        const result = await Location.reverseGeocodeAsync({
          latitude,
          longitude
        });
        
        if (result && result[0]) {
          const address = result[0];
          const addressParts = [
            address.street,
            address.district,
            address.city,
            address.region,
            address.country
          ].filter(Boolean);
          
          if (addressParts.length > 0) {
            return addressParts.join(', ');
          }
        }
        
        // If no address found, try to get a more general location
        if (i === retries - 1) {
          const generalLocation = await Location.reverseGeocodeAsync({
            latitude,
            longitude
          });
          
          if (generalLocation && generalLocation[0]) {
            const generalAddress = generalLocation[0];
            const generalParts = [
              generalAddress.city,
              generalAddress.region,
              generalAddress.country
            ].filter(Boolean);
            
            if (generalParts.length > 0) {
              return generalParts.join(', ');
            }
          }
        }
        
        // If still no address found, wait before retrying
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Error getting address (attempt ${i + 1}):`, error);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    // If all retries failed, return coordinates as fallback
    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  }, [language]);

  // Get user's current location with optimized settings
  const getCurrentLocation = useCallback(async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          language === 'ar' ? 'خطأ' : 'Error',
          language === 'ar' ? 'لم يتم منح إذن الوصول إلى الموقع' : 'Location permission was denied',
          [
            {
              text: language === 'ar' ? 'إعدادات' : 'Settings',
              onPress: () => Linking.openSettings()
            },
            {
              text: language === 'ar' ? 'إلغاء' : 'Cancel',
              style: 'cancel'
            }
          ]
        );
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000,
        distanceInterval: 10
      });
      
      // Check if location is within Palestine bounds
      const isInPalestine = 
        location.coords.latitude >= palestineBounds.south &&
        location.coords.latitude <= palestineBounds.north &&
        location.coords.longitude >= palestineBounds.west &&
        location.coords.longitude <= palestineBounds.east;

      if (!isInPalestine) {
        Alert.alert(
          language === 'ar' ? 'تنبيه' : 'Alert',
          language === 'ar' ? 'يبدو أنك خارج حدود فلسطين. سيتم عرض الخريطة على فلسطين.' : 'You appear to be outside Palestine. The map will show Palestine.',
          [{ text: 'OK' }]
        );
        // Set to center of Palestine
        setCurrentLocation({
          coords: {
            latitude: 31.9522,
            longitude: 35.2332,
            altitude: null,
            accuracy: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        });
      } else {
        setCurrentLocation(location);
      }
      
      // Update map region with appropriate zoom level
      setMapRegion({
        latitude: isInPalestine ? location.coords.latitude : 31.9522,
        longitude: isInPalestine ? location.coords.longitude : 35.2332,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      });

      // Get address for current location
      const address = await getAddressFromCoordinates(
        isInPalestine ? location.coords.latitude : 31.9522,
        isInPalestine ? location.coords.longitude : 35.2332
      );
      console.log('Current location address:', address);

    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'حدث خطأ أثناء تحديد موقعك' : 'Error getting your location'
      );
    } finally {
      setLoading(false);
    }
  }, [language, getAddressFromCoordinates]);

  // Fetch addresses for all locations with progress tracking
  const fetchAddresses = useCallback(async (locations: SavedLocation[]) => {
    setLoading(true);
    try {
      const addresses: {[key: string]: string} = {};
      let completed = 0;
      
      for (const location of locations) {
        const address = await getAddressFromCoordinates(location.latitude, location.longitude);
        addresses[location.id] = address;
        completed++;
        
        // Update loading state with progress
        if (completed % 2 === 0) { // Update every 2 locations to avoid too many re-renders
          setLocationAddresses(prev => ({...prev, ...addresses}));
        }
      }
      
      // Final update with all addresses
      setLocationAddresses(addresses);
    } catch (error) {
      console.error('Error fetching addresses:', error);
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'حدث خطأ أثناء تحميل العناوين' : 'Error loading addresses'
      );
    } finally {
      setLoading(false);
    }
  }, [getAddressFromCoordinates]);

  // Fetch saved locations with error handling
  const fetchSavedLocations = useCallback(async () => {
    setLoading(true);
    try {
      const locationsRef = collection(db, 'user_locations');
      const q = query(locationsRef, where('userId', '==', user?.id));
      const querySnapshot = await getDocs(q);
      
      const locations: SavedLocation[] = [];
      querySnapshot.forEach((doc) => {
        locations.push({ id: doc.id, ...doc.data() } as SavedLocation);
      });
      
      setSavedLocations(locations);
      const defaultLocation = locations.find(loc => loc.isDefault);
      if (defaultLocation) {
        setSelectedLocation(defaultLocation);
      }

      // Fetch addresses for all locations
      await fetchAddresses(locations);
    } catch (error) {
      console.error('Error fetching locations:', error);
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'حدث خطأ أثناء تحميل المواقع المحفوظة' : 'Error loading saved locations'
      );
    } finally {
      setLoading(false);
    }
  }, [user?.id, fetchAddresses]);

  // Initialize data
  useEffect(() => {
    getCurrentLocation();
    fetchSavedLocations();
  }, [getCurrentLocation, fetchSavedLocations]);

  // Save new location
  const saveNewLocation = async () => {
    if (!currentLocation) {
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'الرجاء تحديد موقعك أولاً' : 'Please get your location first'
      );
      return;
    }

    if (savedLocations.length >= 3) {
      Alert.alert(
        language === 'ar' ? 'تنبيه' : 'Alert',
        language === 'ar' ? 'لا يمكنك حفظ أكثر من 3 مواقع. يرجى حذف موقع قبل إضافة موقع جديد.' : 'You cannot save more than 3 locations. Please delete a location before adding a new one.'
      );
      return;
    }

    setShowNameModal(true);
  };

  // Handle save location with name
  const handleSaveLocation = async () => {
    if (!locationName.trim()) {
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'يرجى إدخال اسم للموقع' : 'Please enter a location name'
      );
      return;
    }

    try {
      setButtonLoading(prev => ({ ...prev, saveLocation: true }));
      const locationData = {
        userId: user?.id,
        name: locationName.trim(),
        latitude: currentLocation!.coords.latitude,
        longitude: currentLocation!.coords.longitude,
        isDefault: savedLocations.length === 0,
        createdAt: new Date()
      };

      const docRef = await addDoc(collection(db, 'user_locations'), locationData);
      const newLocation = { id: docRef.id, ...locationData };
      setSavedLocations([...savedLocations, newLocation]);

      if (locationData.isDefault) {
        setSelectedLocation(newLocation);
      }

      setShowNameModal(false);
      setLocationName('');
      
      Alert.alert(
        language === 'ar' ? 'نجاح' : 'Success',
        language === 'ar' ? 'تم حفظ الموقع بنجاح' : 'Location saved successfully'
      );
    } catch (error) {
      console.error('Error saving location:', error);
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'حدث خطأ أثناء حفظ الموقع' : 'Error saving location'
      );
    } finally {
      setButtonLoading(prev => ({ ...prev, saveLocation: false }));
    }
  };

  // Set location as default
  const setAsDefault = async (location: SavedLocation) => {
    try {
      setButtonLoading(prev => ({ ...prev, setDefault: location.id }));
      
      // If there's already a default location, unset it
      const previousDefault = savedLocations.find(loc => loc.isDefault);
      if (previousDefault) {
        const prevDefaultRef = doc(db, 'user_locations', previousDefault.id);
        await updateDoc(prevDefaultRef, {
          isDefault: false
        });
      }

      // Set new default location
      const newDefaultRef = doc(db, 'user_locations', location.id);
      await updateDoc(newDefaultRef, {
        isDefault: true
      });

      // Update local state
      const updatedLocations = savedLocations.map(loc => ({
        ...loc,
        isDefault: loc.id === location.id
      }));
      
      setSavedLocations(updatedLocations);
      setSelectedLocation(location);

      Alert.alert(
        language === 'ar' ? 'نجاح' : 'Success',
        language === 'ar' ? 'تم تعيين الموقع الافتراضي بنجاح' : 'Default location set successfully'
      );
    } catch (error) {
      console.error('Error setting default location:', error);
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'حدث خطأ أثناء تعيين الموقع الافتراضي' : 'Error setting default location'
      );
    } finally {
      setButtonLoading(prev => ({ ...prev, setDefault: undefined }));
    }
  };

  // Delete location
  const deleteLocation = async (locationId: string) => {
    try {
      setButtonLoading(prev => ({ ...prev, delete: locationId }));
      await deleteDoc(doc(db, 'user_locations', locationId));
      setSavedLocations(savedLocations.filter(loc => loc.id !== locationId));
      Alert.alert(
        language === 'ar' ? 'نجاح' : 'Success',
        language === 'ar' ? 'تم حذف الموقع بنجاح' : 'Location deleted successfully'
      );
    } catch (error) {
      console.error('Error deleting location:', error);
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'حدث خطأ أثناء حذف الموقع' : 'Error deleting location'
      );
    } finally {
      setButtonLoading(prev => ({ ...prev, delete: undefined }));
    }
  };

  // Confirm delete
  const confirmDelete = (location: SavedLocation) => {
    Alert.alert(
      language === 'ar' ? 'تأكيد الحذف' : 'Confirm Delete',
      language === 'ar' ? 'هل أنت متأكد أنك تريد حذف هذا الموقع؟' : 'Are you sure you want to delete this location?',
      [
        {
          text: language === 'ar' ? 'إلغاء' : 'Cancel',
          style: 'cancel'
        },
        {
          text: language === 'ar' ? 'حذف' : 'Delete',
          style: 'destructive',
          onPress: () => deleteLocation(location.id)
        }
      ],
      { cancelable: true }
    );
  };

  // Helper function to detect if text contains Arabic
  const containsArabic = (text: string) => {
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text);
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header title={language === 'ar' ? 'ادارة الموقع ' : 'Manage Location' } showProfileImage={false} showSideMenu={false} />
      <ScrollView className="flex-1">
        {loading ? (
          <LocationSkeleton />
        ) : (
          <>
            {/* Map View */}
            <View className="h-[280px]">
              {currentLocation ? (
                <MapView
                  provider={PROVIDER_GOOGLE}
                  className="w-full h-full rounded-2xl"
                  region={mapRegion}
                  onRegionChangeComplete={setMapRegion}
                  minZoomLevel={7}
                  maxZoomLevel={18}
                  showsUserLocation={true}
                  showsMyLocationButton={true}
                  showsCompass={true}
                  showsScale={true}
                  showsTraffic={false}
                  showsBuildings={true}
                  showsIndoors={true}
                  showsPointsOfInterest={true}
                  zoomEnabled={true}
                  loadingEnabled={true}
                  loadingIndicatorColor="#F97316"
                  loadingBackgroundColor="#FFFFFF"
                  customMapStyle={[
                    {
                      featureType: "poi",
                      elementType: "labels",
                      stylers: [{ visibility: "on" }],
                    },
                  ]}
                >
                  <Marker
                    coordinate={{
                      latitude: currentLocation.coords.latitude,
                      longitude: currentLocation.coords.longitude,
                    }}
                    title={language === 'ar' ? 'موقعك الحالي' : 'Your Current Location'}
                    pinColor="#f97316"
                  />
                  {savedLocations.map((loc) => (
                    <Marker
                      key={loc.id}
                      coordinate={{
                        latitude: loc.latitude,
                        longitude: loc.longitude,
                      }}
                      title={loc.name}
                      pinColor={loc.isDefault ? '#ef4444' : '#3b82f6'}
                    />
                  ))}
                </MapView>
              ) : (
                <MapSkeleton />
              )}
            </View>

            {/* Actions */}
            <View className="p-4">
              <TouchableOpacity
                onPress={saveNewLocation}
                className="bg-orange-500 rounded-lg p-4 mb-4 flex-row items-center justify-center"
                disabled={!currentLocation || loading || buttonLoading.saveLocation}
              >
                {buttonLoading.saveLocation ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <MaterialIcons name="add-location" size={24} color="white" className={language === 'ar' ? 'ml-2' : 'mr-2'} />
                )}
                <Text className={`text-white text-center ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
                  {buttonLoading.saveLocation 
                    ? (language === 'ar' ? 'جاري الحفظ...' : 'Saving...')
                    : (language === 'ar' ? 'حفظ الموقع الحالي' : 'Save Current Location')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Saved Locations */}
            <View className="flex-1 px-4">
              <Text className={`text-lg mb-4 ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'}`}>
                {language === 'ar' ? 'المواقع المحفوظة' : 'Saved Locations'}
              </Text>
              
              {loading ? (
                <View className="space-y-3">
                  {[1, 2, 3].map((_, index) => (
                    <SavedLocationSkeleton key={index} />
                  ))}
                </View>
              ) : savedLocations.length === 0 ? (
                <View className="items-center justify-center py-4">
                  <Text className={`text-gray-500 ${language === 'ar' ? 'font-Cairo' : 'font-Jakarta'}`}>
                    {language === 'ar' ? 'لا توجد مواقع محفوظة' : 'No saved locations'}
                  </Text>
                </View>
              ) : (
                savedLocations.map((location) => {
                  const isArabicName = containsArabic(location.name);
                  return (
                    <TouchableOpacity
                      key={location.id}
                      onPress={() => setAsDefault(location)}
                      className={`p-4 mb-3 rounded-xl border border-gray-200 bg-white shadow-sm relative ${language === 'ar' ? 'rtl' : 'ltr'}`}
                      disabled={buttonLoading.setDefault === location.id || buttonLoading.delete === location.id}
                    >
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          confirmDelete(location);
                        }}
                        className={`absolute top-1.5 ${language === 'ar' ? 'left-1.5' : 'right-1.5'} z-10`}
                        disabled={buttonLoading.delete === location.id}
                      >
                        {buttonLoading.delete === location.id ? (
                          <ActivityIndicator size="small" color="#ef4444" />
                        ) : (
                          <MaterialIcons name="close" size={16} color="#ef4444" />
                        )}
                      </TouchableOpacity>

                      <View className={`flex-row items-center justify-between ${language === 'ar' ? 'flex-row-reverse' : ''}`}>
                        <View className={`flex-1 ${language === 'ar' ? 'items-end' : 'items-start'}`}>
                          <Text className={`text-base ${language === 'ar' ? 'font-CairoBold text-right' : 'font-CairoBold text-left'}`}>
                            {location.name}
                          </Text>
                          <Text className={`text-sm text-gray-500 mt-0.5 ${language === 'ar' ? 'font-Cairo text-right' : 'font-Jakarta text-left'}`}>
                            {locationAddresses[location.id] || (language === 'ar' ? 'جاري تحميل العنوان...' : 'Loading address...')}
                          </Text>
                          {location.isDefault && (
                            <Text className={`text-xs text-orange-500 mt-1 font-CairoSemiBold ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                              {language === 'ar' ? 'الموقع الافتراضي' : 'Default Location'}
                            </Text>
                          )}
                        </View>
                        {buttonLoading.setDefault === location.id ? (
                          <View className={`w-7 h-7 items-center justify-center ${language === 'ar' ? 'ml-3' : 'mr-3'}`}>
                            <ActivityIndicator size="small" color="#f97316" />
                          </View>
                        ) : location.isDefault ? (
                          <View className={`w-7 h-7 rounded-full border-2 border-orange-500 items-center justify-center ${language === 'ar' ? 'ml-3' : 'mr-3'}`}>
                            <View className="w-4 h-4 rounded-full bg-orange-500" />
                          </View>
                        ) : (
                          <View className={`w-7 h-7 rounded-full border-2 border-orange-500 ${language === 'ar' ? 'ml-3' : 'mr-3'}`} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Location Name Modal */}
      <Modal
        visible={showNameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNameModal(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className={`bg-white w-[90%] rounded-2xl p-6 ${language === 'ar' ? 'rtl' : 'ltr'}`}>
            <Text className={`text-xl mb-4 ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'}`}>
              {language === 'ar' ? 'اسم الموقع' : 'Location Name'}
            </Text>
            
            <TextInput
              className={`border border-gray-300 rounded-lg p-4 mb-4 text-base ${
                language === 'ar' ? 'font-Cairo text-right' : 'font-Jakarta text-left'
              }`}
              placeholder={language === 'ar' ? 'أدخل اسماً للموقع' : 'Enter a name for this location'}
              value={locationName}
              onChangeText={setLocationName}
              autoFocus
            />

            <View className={`flex-row justify-end space-x-3 ${language === 'ar' ? 'flex-row-reverse' : ''}`}>
              <TouchableOpacity
                onPress={() => {
                  setShowNameModal(false);
                  setLocationName('');
                }}
                className="px-4 py-2 rounded-lg bg-gray-200"
                disabled={buttonLoading.saveLocation}
              >
                <Text className={`${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={handleSaveLocation}
                className="px-4 py-2 rounded-lg bg-orange-500"
                disabled={buttonLoading.saveLocation}
              >
                {buttonLoading.saveLocation ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className={`text-white ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
                    {language === 'ar' ? 'حفظ' : 'Save'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
} 