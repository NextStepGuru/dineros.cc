import { Redirect, Stack } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { login } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { colors, spacing } from "@/constants/theme";

export default function LoginScreen() {
  const { status, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tokenChallenge, setTokenChallenge] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [mfaHint, setMfaHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === "authenticated") {
    return <Redirect href="/accounts" />;
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await login(email.trim(), password, needsCode ? tokenChallenge.trim() : undefined);
      if (res.twoFactorChallengeRequired) {
        setNeedsCode(true);
        const methods = res.mfaMethods ?? [];
        if (methods.some((m) => m === "email" || m === "passkey")) {
          setMfaHint(
            "Email codes and passkeys can only be completed on the web app — enter a code from your authenticator app (or a backup code).",
          );
        }
        setError("Enter your two-factor code to continue.");
        return;
      }
      if (res.token) {
        await signIn(res.token, res.user ?? null);
        return;
      }
      setError(res.message ?? "Login failed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Dineros</Text>
          <Text style={styles.subtitle}>Predictive budgeting</Text>

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholder="••••••••"
          />
          {needsCode ? (
            <Field
              label="Two-factor code"
              value={tokenChallenge}
              onChangeText={setTokenChallenge}
              keyboardType="number-pad"
              autoCapitalize="none"
              placeholder="123456 or backup code"
            />
          ) : null}

          {mfaHint && needsCode ? <Text style={styles.hint}>{mfaHint}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label={needsCode ? "Verify & sign in" : "Sign in"}
            loading={submitting}
            disabled={!email || !password || (needsCode && !tokenChallenge)}
            onPress={() => {
              void submit();
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  scroll: { gap: spacing.lg, padding: spacing.xl },
  title: { color: colors.text, fontSize: 32, fontWeight: "800", textAlign: "center", marginTop: spacing.xl },
  subtitle: { color: colors.textSecondary, textAlign: "center", marginTop: -spacing.lg },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  error: { color: colors.negative, fontSize: 14, textAlign: "center" },
});
