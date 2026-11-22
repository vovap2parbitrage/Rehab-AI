from sqlalchemy import Column, DateTime, ForeignKey, Table

from app.db.base import Base

patient_therapist_table = Table(
    "patient_therapists",
    Base.metadata,
    Column("patient_id", ForeignKey("patients.id"), primary_key=True),
    Column("therapist_id", ForeignKey("users.id"), primary_key=True),
    Column("archived_at", DateTime(timezone=True), nullable=True),
)
