import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View, Platform, Image, TouchableOpacity, StyleSheet } from "react-native";
import MapView, { PROVIDER_DEFAULT, Marker, Circle, PROVIDER_GOOGLE } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import * as Location from "expo-location";
import * as Haptics from 'expo-haptics';

import { icons } from "@/constants";
import { useLocationStore } from "@/store";
import { calculateRegion } from "@/lib/map";
import { useLanguage } from "@/context/LanguageContext";

const directionsAPI = process.env.EXPO_PUBLIC_DIRECTIONS_API_KEY;

interface MapProps {
  showUserLocation?: boolean;
  origin?: {
    latitude: number;
    longitude: number;
  };
  destination?: {
    latitude: number;
    longitude: number;
  };
  isLocationEnabled?: boolean;
}

const Map = ({
  showUserLocation = false,
  origin,
  destination,
  isLocationEnabled = true,
}: MapProps) => {
  const {
    userLongitude,
    userLatitude,
    destinationLatitude,
    destinationLongitude,
  } = useLocationStore();
  const mapRef = useRef<MapView | null>(null);
  const { language } = useLanguage();

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [currentLocation, setCurrentLocation] = useState<any>({
    latitude: 31.9522,  // Palestine center latitude
    longitude: 35.2332, // Palestine center longitude
    latitudeDelta: 0.01,   // Start zoomed in
    longitudeDelta: 0.01,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowingUser, setIsFollowingUser] = useState(true);

  // Get current user location with optimized settings
  useEffect(() => {
    const getLocation = async () => {
      try {
        setIsLoading(true);
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted" && isLocationEnabled) {
          // Use lower accuracy for faster initial load
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Low,
            timeInterval: 5000,
            distanceInterval: 10,
          });

          const newLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
          
          setUserLocation(newLocation);
          // Set initial zoomed in view of user location
          setCurrentLocation({
            latitude: newLocation.latitude,
            longitude: newLocation.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          });

          // Update to higher accuracy after initial load
          const watchLocation = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 5000,
              distanceInterval: 10,
            },
            (newLocation) => {
              if (isLocationEnabled) {
                setUserLocation({
                  latitude: newLocation.coords.latitude,
                  longitude: newLocation.coords.longitude,
                });
              }
            }
          );

          return () => {
            watchLocation.remove();
          };
        } else {
          setUserLocation(null);
        }
      } catch (error) {
        console.error("Error getting location: ", error);
        setUserLocation(null);
      } finally {
        setIsLoading(false);
      }
    };

    getLocation();
  }, [isLocationEnabled]);

  const handleCurrentLocationPress = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setIsFollowingUser(true);
      
      if (userLocation) {
        mapRef.current?.animateToRegion({
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        });
      }
    } catch (error) {
      console.error("Error centering on user location:", error);
    }
  };

  const handleMapPress = () => {
    setIsFollowingUser(false);
  };

  // Update map region when user location changes
  useEffect(() => {
    if (userLocation && isFollowingUser) {
      mapRef.current?.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      });
    }
  }, [userLocation, isFollowingUser]);

  // Show map immediately with loading overlay
  return (
    <View className="w-full h-full">
      <MapView
        provider={PROVIDER_GOOGLE}
        ref={mapRef}
        className="w-full h-full rounded-2xl"
        mapType={Platform.OS === "android" ? "standard" : "mutedStandard"}
        showsPointsOfInterest={true}
        initialRegion={currentLocation}
        showsUserLocation={true}
        showsMyLocationButton={false}
        followsUserLocation={isFollowingUser}
        zoomEnabled={true}
        loadingEnabled={true}
        loadingIndicatorColor="#F97316"
        loadingBackgroundColor="#FFFFFF"
              showsCompass={true}
              showsScale={true}
              showsTraffic={false}
              showsBuildings={true}
              showsIndoors={true}
        minZoomLevel={5}
        maxZoomLevel={20}
        onPress={handleMapPress}
        customMapStyle={[
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "on" }],
          },
        ]}
      >


        {/* 1km Radius Circle
        {userLocation && (
          <Circle
            center={userLocation}
            radius={1000}
            strokeColor="#F97316"
            strokeWidth={3}
            fillColor="rgba(249, 115, 22, 0.15)"
          />
        )} */}

        {/* Route */}
        {origin && destination && (
          <MapViewDirections
            origin={origin}
            destination={destination}
            apikey={directionsAPI!}
            strokeColor="#F97316"
            strokeWidth={4}
            lineDashPattern={[1]}
          />
        )}
      </MapView>

      {/* Loading Overlay */}
      {isLoading && (
        <View className="absolute inset-0 bg-white/80 items-center justify-center rounded-2xl">
          <ActivityIndicator size="large" color="#F97316" />
          <Text className="mt-2 text-gray-600 font-JakartaMedium">
            {language === 'ar' ? 'جاري تحميل الخريطة...' : 'Loading map...'}
          </Text>
        </View>
      )}

      {/* Current Location Button */}
      <TouchableOpacity
        onPress={handleCurrentLocationPress}
        className={`absolute right-3 bottom-2/3 -translate-y-1/2 p-3 rounded-full shadow-lg ${
          isFollowingUser ? 'bg-orange-500' : 'bg-white'
        }`}
        style={styles.locationButton}
      >
        <Image
          source={icons.target}
          style={[
            styles.locationButtonImage,
            isFollowingUser && { tintColor: '#FFFFFF' }
          ]}
          resizeMode="contain"
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  locationButton: {
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  locationButtonImage: {
    width: 24,
    height: 24,
  },
});

export default Map;
