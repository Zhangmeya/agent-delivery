import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "@/lib/router";
import { authApi } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";
import { getRememberedInvitePath } from "../lib/invite-memory";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Eye, EyeOff, Workflow } from "lucide-react";
import { BRAND_NAME } from "../lib/branding";

type AuthMode = "sign_in" | "sign_up";

export function AuthPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get("preview") === "1";
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = "auth-error";

  const nextPath = useMemo(
    () => searchParams.get("next") || getRememberedInvitePath() || "/",
    [searchParams],
  );
  const { data: session, isLoading: isSessionLoading } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });

  useEffect(() => {
    if (session && !isPreview) {
      navigate(nextPath, { replace: true });
    }
  }, [session, isPreview, navigate, nextPath]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === "sign_in") {
        await authApi.signInEmail({ email: email.trim(), password });
        return;
      }
      await authApi.signUpEmail({
        name: name.trim(),
        email: email.trim(),
        password,
      });
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.health });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      navigate(nextPath, { replace: true });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : t("auth.authenticationFailed"));
    },
  });

  const canSubmit =
    email.trim().length > 0 &&
    password.trim().length > 0 &&
    (mode === "sign_in" || (name.trim().length > 0 && password.trim().length >= 8));

  if (isSessionLoading && !isPreview) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-y-auto bg-background">
      <img
        src="/agent-delivery-login-hero.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative z-0 flex min-h-full items-center px-5 py-8 sm:px-10 lg:px-20">
        <main className="w-full max-w-md rounded-lg border border-delivery-glass-border bg-delivery-surface-strong p-7 shadow-xl backdrop-blur-xl sm:p-10">
          <div className="mb-8 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Workflow className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold">{BRAND_NAME}</span>
              <span className="block text-xs text-muted-foreground">{t("auth.productNameCn")}</span>
            </span>
          </div>

          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
            {mode === "sign_in" ? t("auth.welcomeBack") : t("auth.createWorkspace")}
          </p>
          <h1 className="text-2xl font-semibold">
            {mode === "sign_in" ? t("auth.title.signIn") : t("auth.title.signUp")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "sign_in"
              ? t("auth.subtitle.signIn")
              : t("auth.subtitle.signUp")}
          </p>
          {isPreview ? (
            <p className="mt-3 rounded-md border border-delivery-amber/30 bg-delivery-amber/8 px-3 py-2 text-xs text-muted-foreground">
              {t("auth.previewMode")}
            </p>
          ) : null}

          <form
            className="mt-7 space-y-4"
            method="post"
            action={mode === "sign_up" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email"}
            onSubmit={(event) => {
              event.preventDefault();
              if (isPreview) return;
              if (mutation.isPending) return;
              if (!canSubmit) {
                setError(t("auth.requiredFields"));
                return;
              }
              mutation.mutate();
            }}
          >
            {mode === "sign_up" && (
              <div>
                <label htmlFor="name" className="mb-1 block text-xs text-muted-foreground">{t("auth.name")}</label>
                <input
                  id="name"
                  name="name"
                  className="h-11 w-full rounded-md border border-input bg-background/75 px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground/50"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  required
                  aria-required="true"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  autoFocus
                />
              </div>
            )}
            <div>
              <label htmlFor="email" className="mb-1 block text-xs text-muted-foreground">{t("auth.email")}</label>
              <input
                id="email"
                name="email"
                className="h-11 w-full rounded-md border border-input bg-background/75 px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground/50"
                type="email"
                value={email}
                placeholder={t("auth.emailPlaceholder")}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                required
                aria-required="true"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                autoFocus={mode === "sign_in"}
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-xs text-muted-foreground">{t("auth.password")}</label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  className="h-11 w-full rounded-md border border-input bg-background/75 px-3 pr-11 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground/50"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  placeholder={t("auth.passwordPlaceholder")}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
                  required
                  aria-required="true"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground transition hover:text-foreground"
                  aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && (
              <p id={errorId} role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={mutation.isPending || isPreview}
              aria-disabled={!canSubmit || mutation.isPending || isPreview}
              className={`h-11 w-full ${(!canSubmit || isPreview) && !mutation.isPending ? "opacity-50" : ""}`}
            >
              {mutation.isPending
                ? t("common.working")
                : mode === "sign_in"
                  ? t("auth.submit.signIn")
                  : t("auth.submit.signUp")}
            </Button>
          </form>

          <div className="mt-5 text-sm text-muted-foreground">
            {mode === "sign_in" ? t("auth.needAccount") : t("auth.haveAccount")}{" "}
            <button
              type="button"
              className="font-medium text-foreground underline underline-offset-2"
              onClick={() => {
                setError(null);
                setMode(mode === "sign_in" ? "sign_up" : "sign_in");
              }}
            >
              {mode === "sign_in" ? t("auth.createOne") : t("auth.signInLink")}
            </button>
          </div>
        </main>

        <section className="ml-auto hidden max-w-lg self-end pb-8 text-right lg:block">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">{t("auth.valueEyebrow")}</p>
          <h2 className="mt-3 text-4xl font-semibold leading-tight text-foreground">
            {t("auth.valueTitle")}
          </h2>
          <p className="ml-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">
            {t("auth.valueDescription")}
          </p>
        </section>
      </div>
    </div>
  );
}
