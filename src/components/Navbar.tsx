"use client";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Avatar from "@mui/material/Avatar";
import Divider from "@mui/material/Divider";
import { useColorMode } from "@/app/theme-client";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LogoutIcon from "@mui/icons-material/Logout";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import PeopleIcon from "@mui/icons-material/People";
import MenuIcon from "@mui/icons-material/Menu";
import QueryStatsIcon from "@mui/icons-material/QueryStats";
import DescriptionIcon from "@mui/icons-material/Description";

export default function Navbar() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { mode, toggle } = useColorMode();
  const [navAnchor, setNavAnchor] = useState<null | HTMLElement>(null);
  const [userAnchor, setUserAnchor] = useState<null | HTMLElement>(null);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_e, session) => {
        const user = session?.user;
        setUserEmail(user?.email ?? null);
        setUserName(
          (user?.user_metadata?.full_name as string) ||
            (user?.user_metadata?.name as string) ||
            user?.email?.split("@")[0] ||
            null
        );
        setUserAvatar(
          (user?.user_metadata?.avatar_url as string) ||
            (user?.user_metadata?.picture as string) ||
            null
        );
      }
    );
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setUserEmail(user?.email ?? null);
      setUserName(
        (user?.user_metadata?.full_name as string) ||
          (user?.user_metadata?.name as string) ||
          user?.email?.split("@")[0] ||
          null
      );
      setUserAvatar(
        (user?.user_metadata?.avatar_url as string) ||
          (user?.user_metadata?.picture as string) ||
          null
      );
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setError(error.message);
      setLoggingOut(false);
      return;
    }
    router.replace("/login");
    setLoggingOut(false);
  };

  const openNav = Boolean(navAnchor);
  const openUser = Boolean(userAnchor);

  return (
    <AppBar
      position="sticky"
      color="transparent"
      elevation={0}
      sx={{
        backdropFilter: "blur(14px)",
        bgcolor: (t) =>
          t.palette.mode === "light"
            ? "rgba(255,255,255,0.85)"
            : "rgba(21,24,27,0.7)",
        borderBottom: (t) => `1px solid ${t.palette.divider}`,
      }}
    >
      <Toolbar sx={{ gap: 2, minHeight: 64 }}>
        <Box sx={{ display: { xs: "flex", md: "none" } }}>
          <IconButton
            color="inherit"
            edge="start"
            aria-label="menu"
            onClick={(e) => setNavAnchor(e.currentTarget)}
          >
            <MenuIcon />
          </IconButton>
        </Box>
        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 1,
            fontSize: { xs: 16, sm: 18 },
          }}
        >
          Registro de{" "}
          <Box component="span" sx={{ fontWeight: 400, opacity: 0.6 }}>
            Precursorado
          </Box>
        </Typography>
        <Box
          sx={{
            display: { xs: "none", md: "flex" },
            gap: 1,
            alignItems: "center",
          }}
        >
          <Button
            startIcon={<CalendarMonthIcon />}
            component={Link as unknown as React.ElementType}
            href="/"
            color="inherit"
            sx={{ fontWeight: 500 }}
          >
            Calendario
          </Button>
          <Button
            startIcon={<PeopleIcon />}
            component={Link as unknown as React.ElementType}
            href="/persons"
            color="inherit"
            sx={{ fontWeight: 500 }}
          >
            Personas
          </Button>
          <Button
            startIcon={<QueryStatsIcon />}
            component={Link as unknown as React.ElementType}
            href="/estadisticas"
            color="inherit"
            sx={{ fontWeight: 500 }}
          >
            Estadísticas
          </Button>
          <Button
            startIcon={<DescriptionIcon />}
            component={Link as unknown as React.ElementType}
            href="/informes"
            color="inherit"
            sx={{ fontWeight: 500 }}
          >
            Informes
          </Button>
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title={mode === "light" ? "Modo oscuro" : "Modo claro"}>
          <IconButton
            color="inherit"
            onClick={toggle}
            aria-label="Cambiar tema"
          >
            {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
        </Tooltip>
        {userEmail ? (
          <>
            <Tooltip title={userName || userEmail}>
              <Avatar
                onClick={(e) => setUserAnchor(e.currentTarget)}
                sx={{
                  cursor: "pointer",
                  width: 34,
                  height: 34,
                  bgcolor: "primary.main",
                  fontSize: 14,
                }}
                src={userAvatar || undefined}
                alt={userName || userEmail || "Usuario"}
              >
                {(userName || userEmail || "?").charAt(0).toUpperCase()}
              </Avatar>
            </Tooltip>
            <Menu
              anchorEl={userAnchor}
              open={openUser}
              onClose={() => setUserAnchor(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
              <Box sx={{ px: 2, py: 1.5, maxWidth: 240 }}>
                <Typography
                  variant="caption"
                  sx={{ display: "block", opacity: 0.7 }}
                >
                  Sesión
                </Typography>
                {userName && (
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, lineHeight: 1.3 }}
                  >
                    {userName}
                  </Typography>
                )}
                <Typography
                  variant="caption"
                  sx={{ opacity: 0.7, wordBreak: "break-all" }}
                >
                  {userEmail}
                </Typography>
              </Box>
              <Divider />
              <MenuItem
                onClick={() => {
                  setUserAnchor(null);
                  signOut();
                }}
                disabled={loggingOut}
              >
                <LogoutIcon fontSize="small" style={{ marginRight: 8 }} />
                {loggingOut ? "Saliendo..." : "Salir"}
              </MenuItem>
            </Menu>
          </>
        ) : (
          <Button
            variant="contained"
            color="primary"
            component={Link as unknown as React.ElementType}
            href="/login"
          >
            Ingresar
          </Button>
        )}
        <Menu
          anchorEl={navAnchor}
          open={openNav}
          onClose={() => setNavAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
          sx={{ display: { xs: "block", md: "none" } }}
        >
          <MenuItem
            component={Link as unknown as React.ElementType}
            href="/"
            onClick={() => setNavAnchor(null)}
          >
            <CalendarMonthIcon fontSize="small" style={{ marginRight: 8 }} />{" "}
            Calendario
          </MenuItem>
          <MenuItem
            component={Link as unknown as React.ElementType}
            href="/persons"
            onClick={() => setNavAnchor(null)}
          >
            <PeopleIcon fontSize="small" style={{ marginRight: 8 }} /> Personas
          </MenuItem>
          <MenuItem
            component={Link as unknown as React.ElementType}
            href="/estadisticas"
            onClick={() => setNavAnchor(null)}
          >
            <QueryStatsIcon fontSize="small" style={{ marginRight: 8 }} />{" "}
            Estadísticas
          </MenuItem>
          <MenuItem
            component={Link as unknown as React.ElementType}
            href="/informes"
            onClick={() => setNavAnchor(null)}
          >
            <DescriptionIcon fontSize="small" style={{ marginRight: 8 }} />{" "}
            Informes
          </MenuItem>
        </Menu>
      </Toolbar>
      {error && (
        <Typography variant="caption" color="error" sx={{ px: 2, pb: 1 }}>
          {error}
        </Typography>
      )}
    </AppBar>
  );
}
