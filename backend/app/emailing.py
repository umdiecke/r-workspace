import secrets
import smtplib
from email.message import EmailMessage

from app.config import settings


def generate_temporary_password(length: int = 12) -> str:
    return secrets.token_urlsafe(length)[:length]


def send_password_reset_email(recipient: str, username: str, temporary_password: str) -> None:
    message = EmailMessage()
    message["Subject"] = "R.Workspace password reset"
    message["From"] = settings.smtp_sender
    message["To"] = recipient
    message.set_content(
        "Hello,\n\n"
        f"a new temporary password has been generated for your account '{username}'.\n"
        f"Temporary password: {temporary_password}\n\n"
        "Please sign in and change it immediately in your account settings.\n"
    )

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_username and settings.smtp_password:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)
