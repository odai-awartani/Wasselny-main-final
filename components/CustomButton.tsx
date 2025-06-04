import { useLanguage } from "@/context/LanguageContext";
import { ButtonProps } from "@/types/type";
import { Text, TouchableOpacity, ActivityIndicator } from "react-native";

const getBgVariantStyle = (variant: ButtonProps["bgVariant"]) => {
    switch (variant) {
        case "secondary":
            return 'bg-gray-500';
        case "danger":
            return 'bg-red-500';
        case "success":
            return 'bg-green-500';
        case "outline":
            return 'bg-transparent border-neutral-300 border-[0.5px]';   
        default:
            return 'bg-orange-500';
    }
};

const getTextVariantStyle = (variant: ButtonProps["textVariant"]) => {
    switch (variant) {
        case "primary":
            return 'text-black';
        case "secondary":
            return 'text-gray-100'; 
        case "danger":
            return 'text-red-100';
        case "success":
            return 'text-green-100';  
        default:
            return 'text-white';
    }
};

const CustomButton = ({
    onPress,
    title,
    bgVariant = "primary",
    textVariant = "default",
    IconLeft,
    IconRight,
    className = "",
    loading = false,
    disabled = false,
    children,
    ...props
}: ButtonProps) => {
    const { language } = useLanguage();

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled || loading}
            className={`w-full rounded-full flex flex-row p-3 justify-center items-center shadow-md shadow-neutral-400/70 ${getBgVariantStyle(bgVariant)} ${className} ${(disabled || loading) ? 'opacity-70' : ''}`}
            {...props}
        >
            {IconLeft && !loading && <IconLeft />}
            {loading ? (
                <ActivityIndicator color="white" size="small" />
            ) : (
                <>
                    <Text
                        className={`text-lg font-CairoBold ${getTextVariantStyle(textVariant)}`}
                    >
                        {title}
                    </Text>
                    {IconRight && <IconRight />}
                    {children}
                </>
            )}
        </TouchableOpacity>
    );
};
//${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}
export default CustomButton;