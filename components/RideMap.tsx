import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View, Platform, TouchableOpacity, Image, Alert } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import * as Location from "expo-location";
import { MaterialIcons } from "@expo/vector-icons";

import { icons } from "@/constants";
import { calculateRegion } from "@/lib/map";
import CustomErrorModal from '@/components/CustomErrorModal';

interface LocationCoords {
  latitude: number;
  longitude: number;
}

interface Location {
  latitude?: number;
  longitude?: number;
}

interface Waypoint {
  latitude: number;
  longitude: number;
  address: string;
}

interface RideMapProps {
  origin?: Location;
  destination?: Location;
  waypoints?: Waypoint[];
  onTargetPress?: () => void;
  passengerLocations?: Record<string, { latitude: number; longitude: number; name: string }>;
  language: "en" | "ar";
}

const directionsAPI = process.env.EXPO_PUBLIC_DIRECTIONS_API_KEY;

const RideMap = ({ origin, destination, waypoints = [], onTargetPress, passengerLocations = {}, language }: RideMapProps) => {
  const [userLocation, setUserLocation] = useState<LocationCoords | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const hasOrigin = origin?.latitude && origin?.longitude;
  const hasDestination = destination?.latitude && destination?.longitude;

  // Validate coordinates
  const isValidCoordinate = (coord: number) => {
    return typeof coord === 'number' && coord >= -90 && coord <= 90;
  };

  const isValidRoute = hasOrigin && 
    hasDestination && 
    isValidCoordinate(origin.latitude!) && 
    isValidCoordinate(origin.longitude!) && 
    isValidCoordinate(destination.latitude!) && 
    isValidCoordinate(destination.longitude!);

  console.log('RideMap received props:', { origin, destination, waypoints });
  console.log('isValidRoute:', isValidRoute);
  if (!isValidRoute) {
    console.log('Invalid coordinate detected:');
    if (!hasOrigin) console.log('  Origin is missing or invalid');
    else {
      if (!isValidCoordinate(origin.latitude!)) console.log('  Origin Latitude is invalid:', origin.latitude);
      if (!isValidCoordinate(origin.longitude!)) console.log('  Origin Longitude is invalid:', origin.longitude);
    }
    if (!hasDestination) console.log('  Destination is missing or invalid');
    else {
      if (!isValidCoordinate(destination.latitude!)) console.log('  Destination Latitude is invalid:', destination.latitude);
      if (!isValidCoordinate(destination.longitude!)) console.log('  Destination Longitude is invalid:', destination.longitude);
    }
  }

  // جلب موقع المستخدم الحالي
  useEffect(() => {
    const fetchLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        const location = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = location.coords;
        setUserLocation({ latitude, longitude });
      } catch (error) {
        console.error("Error getting location", error);
      }
    };

    fetchLocation();
  }, []);

  if (!hasOrigin || !hasDestination) {
    return (
      <View className="flex items-center justify-center w-full h-full bg-white">
        <ActivityIndicator size="small" color="#0286FF" />
      </View>
    );
  }

  const region = calculateRegion({
    userLatitude: origin.latitude!,
    userLongitude: origin.longitude!,
    destinationLatitude: destination.latitude!,
    destinationLongitude: destination.longitude!,
  });

  return (
    <View className="w-full h-full">
      <MapView
        ref={(ref) => (mapRef.current = ref)}
        provider={PROVIDER_DEFAULT}
        className="w-full h-full"
        style={{ flex: 1 }}
        mapType={Platform.OS === "android" ? "standard" : "mutedStandard"}
        initialRegion={region}
        showsUserLocation={true}
        showsMyLocationButton={false}
        userInterfaceStyle="light"
      >
        {/* نقطة الانطلاق */}
        <Marker
          coordinate={{
            latitude: origin.latitude!,
            longitude: origin.longitude!,
          }}
          title="نقطة الانطلاق"
          description="مكان بداية الرحلة"
          image={icons.pin}
        />

        {/* نقاط المرور */}
        {waypoints.map((waypoint, index) => (
          <Marker
            key={`waypoint-${index}`}
            coordinate={{
              latitude: waypoint.latitude,
              longitude: waypoint.longitude,
            }}
            title={`نقطة مرور ${index + 1}`}
            description={waypoint.address}
            image={icons.pin}
          />
        ))}

        {/* نقطة الوصول */}
        <Marker
          coordinate={{
            latitude: destination.latitude!,
            longitude: destination.longitude!,
          }}
          title="نقطة الوصول"
          description="مكان نهاية الرحلة"
          image={icons.pin}
        />

        {/* رسم المسار */}
        {isValidRoute && (
          <MapViewDirections
            origin={{
              latitude: origin.latitude!,
              longitude: origin.longitude!,
            }}
            destination={{
              latitude: destination.latitude!,
              longitude: destination.longitude!,
            }}
            waypoints={waypoints.length > 0 ? waypoints.map(waypoint => ({
              latitude: waypoint.latitude,
              longitude: waypoint.longitude,
            })) : undefined}
            apikey={directionsAPI!}
            strokeColor="#0286FF"
            strokeWidth={3}
            optimizeWaypoints={false}
            onError={(errorMessage) => {
              console.warn("حدث خطأ في رسم المسار:", errorMessage);
              const translatedErrorMessage = language === 'ar'
                ? "تعذر رسم المسار على الخريطة. الرجاء التأكد من صحة نقاط البداية والنهاية."
                : "Could not draw the route on the map. Please ensure the start and end points are correct.";
              setErrorMessage(translatedErrorMessage);
              setShowErrorModal(true);
            }}
            onReady={(result) => {
              console.log("Route calculated successfully:", result);
              // Adjust the map region to show the entire route including waypoints
              if (mapRef.current && result.coordinates && result.coordinates.length > 0) {
                const allCoords = [
                  { latitude: origin.latitude!, longitude: origin.longitude! },
                  { latitude: destination.latitude!, longitude: destination.longitude! },
                  ...waypoints.map(waypoint => ({ latitude: waypoint.latitude, longitude: waypoint.longitude }))
                ].filter(coord => coord.latitude !== undefined && coord.longitude !== undefined);

                if (allCoords.length > 0) {
                  mapRef.current.fitToCoordinates(allCoords, {
                    edgePadding: {
                      top: 50,
                      right: 50,
                      bottom: 50,
                      left: 50,
                    },
                    animated: true,
                  });
                }
              }
            }}
          />
        )}

        {/* Passenger Location Markers */}
        {Object.entries(passengerLocations).map(([userId, location]) => (
          <Marker
            key={`passenger-${userId}`}
            coordinate={{
              latitude: location.latitude,
              longitude: location.longitude,
            }}
            title={location.name}
            description="موقع الراكب"
          >
            <View className="bg-white p-2 rounded-full shadow-md">
              <MaterialIcons name="person" size={24} color="#0286FF" />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* زر الذهاب للموقع الحالي */}
      {userLocation && (
        <TouchableOpacity
          onPress={() => {
            onTargetPress?.();
            setTimeout(() => {
              mapRef.current?.animateToRegion({
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              });
            }, 300);
          }}
          className="absolute right-3 top-1/4 -translate-y-1/2 bg-amber-300 p-3 rounded-full shadow-md"
        >
          <Image
            source={icons.target}
            style={{ width: 30, height: 30 }}
            resizeMode="contain"
          />
        </TouchableOpacity>
      )}

      {/* Custom Error Modal */}
      <CustomErrorModal
        visible={showErrorModal}
        message={errorMessage}
        onClose={() => setShowErrorModal(false)}
      />
    </View>
  );
};

export default RideMap;