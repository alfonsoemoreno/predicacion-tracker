"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Stack,
  CircularProgress,
  useTheme,
} from "@mui/material";
import LoginIcon from "@mui/icons-material/LockOpen";
import GoogleIcon from "@mui/icons-material/Google";

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const theme = useTheme();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/");
      } else {
        setChecking(false);
      }
    });
  }, [router]);

  const signIn = async () => {
    setRedirecting(true);
    const origin =
      typeof window !== "undefined" ? window.location.origin : undefined;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: origin ? { redirectTo: origin } : undefined,
    });
  };

  if (checking) {
    return (
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        minHeight="100vh"
      >
        <Stack alignItems="center" gap={2}>
          <CircularProgress />
          <Typography variant="body2" sx={{ opacity: 0.7 }}>
            Verificando sesión...
          </Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        px: 2,
        py: 4,
        background:
          theme.palette.mode === "light"
            ? "linear-gradient(120deg, #e9f7f2 0%, #f2f6ff 60%, #ffffff 100%)"
            : "linear-gradient(120deg, #0d1f1c 0%, #111a26 60%, #121212 100%)",
      }}
    >
      <Card
        elevation={8}
        sx={{
          width: "100%",
          maxWidth: 440,
          borderRadius: 3,
          backdropFilter: "blur(6px)",
        }}
      >
        <CardContent
          sx={{
            p: { xs: 4, sm: 5 },
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: "16px",
                bgcolor: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "primary.contrastText",
                boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                fontWeight: 600,
                fontSize: 20,
                letterSpacing: "-0.5px",
              }}
            >
              RP
            </Box>
            <Stack spacing={0.5}>
              <Typography variant="h5" fontWeight={700} lineHeight={1.2}>
                Registro de precursorado
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                Lleva tus horas y cursos bíblicos con facilidad
              </Typography>
            </Stack>
          </Stack>
          <Typography variant="body2" sx={{ opacity: 0.8, mt: 1 }}>
            Accede con tu cuenta de Google para comenzar a registrar tus
            actividades de predicación y cursos bíblicos.
          </Typography>
          <Stack spacing={1}>
            <Button
              startIcon={<GoogleIcon />}
              variant="contained"
              size="large"
              onClick={signIn}
              disabled={redirecting}
              sx={{
                textTransform: "none",
                fontWeight: 600,
                fontSize: 15,
                py: 1.2,
                background:
                  theme.palette.mode === "light"
                    ? "#fff"
                    : "rgba(255,255,255,0.08)",
                color: theme.palette.mode === "light" ? "#202124" : "#fff",
                border:
                  theme.palette.mode === "light"
                    ? "1px solid #e0e0e0"
                    : "1px solid rgba(255,255,255,0.14)",
                boxShadow:
                  theme.palette.mode === "light"
                    ? "0 2px 4px rgba(0,0,0,0.06)"
                    : "0 2px 4px rgba(0,0,0,0.4)",
                "&:hover": {
                  background:
                    theme.palette.mode === "light"
                      ? "#fafafa"
                      : "rgba(255,255,255,0.15)",
                },
              }}
            >
              {redirecting ? "Redirigiendo..." : "Ingresar con Google"}
            </Button>
            <Typography variant="caption" sx={{ opacity: 0.55 }}>
              Al continuar aceptas que se use tu sesión de Google sólo para
              autenticación.
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ pt: 1 }}>
            <LoginIcon fontSize="small" sx={{ opacity: 0.5 }} />
            <Typography variant="caption" sx={{ opacity: 0.6 }}>
              Tus datos se almacenan de forma privada en tu cuenta.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
