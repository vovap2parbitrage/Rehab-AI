"""move user profile fields from patients to users

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-22 22:56:52.969279

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0008'
down_revision: str | Sequence[str] | None = '0007'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('first_name', sa.String(length=100), nullable=True))
    op.add_column('users', sa.Column('last_name', sa.String(length=100), nullable=True))
    op.add_column('users', sa.Column('date_of_birth', sa.Date(), nullable=True))

    op.execute(
        """
        UPDATE users
        SET first_name = patients.first_name,
            last_name = patients.last_name,
            date_of_birth = patients.date_of_birth
        FROM patients
        WHERE users.id = patients.user_id
        """
    )

    op.create_check_constraint(
        'ck_users_first_name_not_blank',
        'users',
        'first_name IS NULL OR length(trim(first_name)) >= 1',
    )
    op.create_check_constraint(
        'ck_users_last_name_not_blank',
        'users',
        'last_name IS NULL OR length(trim(last_name)) >= 1',
    )

    op.drop_column('patients', 'date_of_birth')
    op.drop_column('patients', 'first_name')
    op.drop_column('patients', 'last_name')


def downgrade() -> None:
    op.add_column('patients', sa.Column('last_name', sa.VARCHAR(length=100), autoincrement=False, nullable=True))
    op.add_column('patients', sa.Column('first_name', sa.VARCHAR(length=100), autoincrement=False, nullable=True))
    op.add_column('patients', sa.Column('date_of_birth', sa.DATE(), autoincrement=False, nullable=True))

    op.execute(
        """
        UPDATE patients
        SET first_name = users.first_name,
            last_name = users.last_name,
            date_of_birth = users.date_of_birth
        FROM users
        WHERE patients.user_id = users.id
        """
    )
    op.execute(
        """
        UPDATE patients
        SET first_name = 'Unknown'
        WHERE first_name IS NULL
        """
    )
    op.execute(
        """
        UPDATE patients
        SET last_name = 'Unknown'
        WHERE last_name IS NULL
        """
    )

    op.alter_column('patients', 'first_name', nullable=False)
    op.alter_column('patients', 'last_name', nullable=False)

    op.create_check_constraint(
        'ck_patients_first_name_not_blank',
        'patients',
        'length(trim(first_name)) >= 1',
    )
    op.create_check_constraint(
        'ck_patients_last_name_not_blank',
        'patients',
        'length(trim(last_name)) >= 1',
    )

    op.drop_constraint('ck_users_last_name_not_blank', 'users', type_='check')
    op.drop_constraint('ck_users_first_name_not_blank', 'users', type_='check')

    op.drop_column('users', 'date_of_birth')
    op.drop_column('users', 'last_name')
    op.drop_column('users', 'first_name')