import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_admin
from app.db import get_session
from app.models import Person
from app.schemas import PersonIn, PersonOut

router = APIRouter(prefix="/api/admin/people", tags=["people"], dependencies=[Depends(require_admin)])


def _clean(body: PersonIn) -> dict:
    # Empty optional strings from the form are stored as NULL.
    return {k: (v.strip() or None) if isinstance(v, str) else v for k, v in body.model_dump().items()}


@router.get("", response_model=list[PersonOut])
async def list_people(session: AsyncSession = Depends(get_session)) -> list[Person]:
    return list((await session.execute(select(Person).order_by(Person.name))).scalars())


@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
async def create_person(body: PersonIn, session: AsyncSession = Depends(get_session)) -> Person:
    person = Person(**_clean(body))
    session.add(person)
    await session.commit()
    await session.refresh(person)
    return person


@router.put("/{person_id}", response_model=PersonOut)
async def update_person(
    person_id: uuid.UUID, body: PersonIn, session: AsyncSession = Depends(get_session)
) -> Person:
    person = await session.get(Person, person_id)
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Person not found")
    for key, value in _clean(body).items():
        setattr(person, key, value)
    await session.commit()
    await session.refresh(person)
    return person


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_person(person_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> None:
    person = await session.get(Person, person_id)
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Person not found")
    await session.delete(person)
    await session.commit()
