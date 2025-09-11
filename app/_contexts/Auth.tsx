import { Platform } from "react-native";

const Auth = {
  AppleSignIn: () => {
    // Return null for non-iOS platforms
    return null;
  },
};

export default Auth;
