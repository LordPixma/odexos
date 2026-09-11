import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, ApiError } from "./api";
import type { AuthState, ResetPreview } from "@shared/types";

interface AuthContextValue {
  auth: AuthState | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  auth: null,
  isLoading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.get<AuthState>("/auth/me");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  const value = useMemo<AuthContextValue>(
    () => ({ auth: data ?? null, isLoading }),
    [data, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post<AuthState>("/auth/login", body),
    onSuccess: (data) => qc.setQueryData(["me"], data),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      familyName: string;
      name: string;
      email: string;
      password: string;
    }) => api.post<AuthState>("/auth/register", body),
    onSuccess: (data) => qc.setQueryData(["me"], data),
  });
}

export function useAcceptInvite(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { password: string }) =>
      api.post<AuthState>(`/invites/${token}/accept`, body),
    onSuccess: (data) => qc.setQueryData(["me"], data),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (body: { email: string }) =>
      api.post<{ ok: boolean }>("/auth/forgot", body),
  });
}

/** Public: validate a reset token so the reset page can render. */
export function useResetToken(token: string) {
  return useQuery({
    queryKey: ["reset", token],
    queryFn: () => api.get<ResetPreview>(`/auth/reset/${token}`),
    retry: false,
  });
}

export function useResetPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { token: string; password: string }) =>
      api.post<AuthState>("/auth/reset", body),
    onSuccess: (data) => qc.setQueryData(["me"], data),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => {
      qc.setQueryData(["me"], null);
      qc.clear();
    },
  });
}
