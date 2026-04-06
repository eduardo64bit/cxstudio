import { type FormEvent, useId, useState } from "react";

interface LoginModalProps {
  onSuccess: () => void;
}

export default function LoginModal({ onSuccess }: LoginModalProps) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const loginId = useId();
  const passwordId = useId();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!login.trim() || !password) {
      setError("Preencha login e senha.");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch("/api/transcribe/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Password": password,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error("invalid");
      }

      onSuccess();
      return;
    } catch {
      setError("Login ou senha incorretos.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-modal-backdrop" role="presentation">
      <div
        className="login-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
      >
        <h1 id="login-modal-title" className="login-modal__title">
          Entrar
        </h1>
        <form className="login-modal__form" onSubmit={handleSubmit}>
          <label className="login-modal__label" htmlFor={loginId}>
            Login
          </label>
          <input
            id={loginId}
            className="login-modal__input"
            type="text"
            name="login"
            autoComplete="username"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
          <label className="login-modal__label" htmlFor={passwordId}>
            Senha
          </label>
          <input
            id={passwordId}
            className="login-modal__input"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? (
            <p className="login-modal__error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="login-modal__submit" disabled={isSubmitting}>
            {isSubmitting ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
