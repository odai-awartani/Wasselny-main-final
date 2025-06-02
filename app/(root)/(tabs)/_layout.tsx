import { icons } from "@/constants";
import { Tabs, Redirect } from "expo-router";
import { View, Image, ImageSourcePropType, Text } from "react-native";
import { createContext } from "react";
import { NotificationProvider } from '@/context/NotificationContext';
import { createDrawerNavigator } from '@react-navigation/drawer';
import SideMenu from '@/components/SideMenu';
import { useLanguage } from '@/context/LanguageContext';
import { DrawerContentComponentProps } from '@react-navigation/drawer';

const Drawer = createDrawerNavigator();

// Create context for driver status
export const DriverStatusContext = createContext<{
  isDriver: boolean;
  recheckDriverStatus: () => Promise<void>;
}>({ 
  isDriver: false,
  recheckDriverStatus: async () => {}
});

const TabIcon = ({ focused, source, name }: { focused: boolean; source: ImageSourcePropType; name: string }) => (
  <View className="items-center justify-center w-16">
    <View className={`w-10 h-10 items-center justify-center rounded-full ${focused ? 'bg-orange-100' : ''}`}>
      <Image 
        source={source} 
        tintColor="white" 
        resizeMode="contain" 
        className="w-6 h-6" 
      />
    </View>
    <Text
      className={`text-xs mt-1 text-center font-CairoBold ${focused ? 'text-orange-100' : 'text-white'}`}
      numberOfLines={1}
      adjustsFontSizeToFit
    >
      {name}
    </Text>
  </View>
);

const Layout = () => {
  const { isRTL, t } = useLanguage();

  return (
    <NotificationProvider>
      <Drawer.Navigator
        drawerContent={(props: DrawerContentComponentProps) => <SideMenu {...props} />}
        screenOptions={{
          headerShown: false,
          drawerPosition: isRTL ? 'right' : 'left',
          drawerType: 'front',
          swipeEnabled: true,
          swipeEdgeWidth: 50,
        }}
      >
        <Drawer.Screen 
          name="tabs" 
          options={{
            headerShown: false,
          }}
        >
          {() => (
            <Tabs
              screenOptions={{
                tabBarActiveTintColor: "white",
                tabBarInactiveTintColor: "white",
                tabBarShowLabel: false,
                tabBarStyle: {
                  backgroundColor: "black",
                  borderRadius: 20,
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                  paddingTop: 20,
                  paddingBottom: 50,
                  marginHorizontal: 0,
                  marginBottom: 0,
                  height: 78,
                  display: "flex",
                  justifyContent: "space-evenly",
                  alignItems: "center",
                  flexDirection: "row",
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  elevation: 0,
                  borderTopWidth: 0,
                },
              }}
            >
              <Tabs.Screen
                name="home"
                options={{
                  headerShown: false,
                  tabBarLabelStyle: {
                    fontFamily: "CairoBold",
                  },
                  tabBarIcon: ({ focused }) => (
                    <TabIcon focused={focused} source={icons.home} name={t.home} />
                  ),
                }}
              />
              <Tabs.Screen
                name="search"
                options={{
                  headerShown: false,
                  tabBarIcon: ({ focused }) => (
                    <TabIcon focused={focused} source={icons.search} name={t.search} />
                  ),
                }}
              />
              <Tabs.Screen
                name="rides"
                options={{
                  title: "Rides",
                  headerShown: false,
                  tabBarIcon: ({ focused }) => (
                    <TabIcon focused={focused} source={icons.list} name={t.rides} />
                  ),
                }}
              />
              <Tabs.Screen
                name="barriers"
                options={{
                  title: "Barriers",
                  headerShown: false,
                  tabBarIcon: ({ focused }) => (
                    <TabIcon focused={focused} source={icons.barrier} name={t.barrier} />
                  ),
                }}
              />
              <Tabs.Screen
                name="chat"
                options={{
                  headerShown: false,
                  tabBarIcon: ({ focused }) => (
                    <TabIcon focused={focused} source={icons.chat} name={t.chat} />
                  ),
                }}
              />
            </Tabs>
          )}
        </Drawer.Screen>
      </Drawer.Navigator>
    </NotificationProvider>
  );
};

export default Layout;