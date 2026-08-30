"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import { fetchJson } from "@/lib/fetch-json";
import {
  emptySalesToday,
  type MemberOperationalStatus,
  type MemberRecentSale,
  type MemberRecentSalesResponse,
  type TodayTotals,
} from "@/lib/helpers/sales-cart";
import type { MemberSummary } from "@/lib/types";

type MemberOperationalDataLoadOptions = {
  reportLoadErrors?: boolean;
};

export function useSalesMember({
  members,
  onMemberLoadError,
  onMemberLoadSuccess,
  rfidRef,
}: {
  members: MemberSummary[];
  onMemberLoadError: (message: string) => void;
  onMemberLoadSuccess: () => void;
  rfidRef: RefObject<HTMLInputElement | null>;
}) {
  const [today, setToday] = useState<TodayTotals>(emptySalesToday);
  const [memberId, setMemberId] = useState("");
  const [memberStatus, setMemberStatus] =
    useState<MemberOperationalStatus | null>(null);
  const [memberStatusLoading, setMemberStatusLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberRecentSales, setMemberRecentSales] = useState<
    MemberRecentSale[]
  >([]);
  const [memberRecentSalesLoading, setMemberRecentSalesLoading] =
    useState(false);
  const [memberRecentSalesError, setMemberRecentSalesError] = useState("");
  const currentMemberIdRef = useRef("");
  const memberStatusRequestIdRef = useRef(0);
  const memberRecentSalesRequestIdRef = useRef(0);

  const loadMemberOperationalData = useCallback(
    async (
      selectedMemberId: string,
      options: MemberOperationalDataLoadOptions = {}
    ) => {
      const normalizedMemberId = selectedMemberId.trim();

      if (!normalizedMemberId) {
        return;
      }

      if (currentMemberIdRef.current !== normalizedMemberId) {
        return;
      }

      const requestId = memberStatusRequestIdRef.current;
      setMemberStatusLoading(true);

      try {
        const [todayData, statusData] = await Promise.all([
          fetchJson<TodayTotals>(`/api/members/${normalizedMemberId}/today`),
          fetchJson<MemberOperationalStatus>(
            `/api/members/${normalizedMemberId}/operational-status`
          ),
        ]);

        if (
          memberStatusRequestIdRef.current !== requestId ||
          currentMemberIdRef.current !== normalizedMemberId
        ) {
          return;
        }

        setToday(todayData);
        setMemberStatus(statusData);
        setMemberStatusLoading(false);

        if (options.reportLoadErrors) {
          onMemberLoadSuccess();
        }
      } catch (err) {
        if (
          memberStatusRequestIdRef.current !== requestId ||
          currentMemberIdRef.current !== normalizedMemberId
        ) {
          return;
        }

        if (options.reportLoadErrors) {
          setToday(emptySalesToday);
          setMemberStatus(null);
          onMemberLoadError(
            err instanceof Error ? err.message : "Error cargando socio"
          );
        }

        setMemberStatusLoading(false);
        throw err;
      }
    },
    [onMemberLoadError, onMemberLoadSuccess]
  );

  const loadMemberRecentSales = useCallback(async (selectedMemberId: string) => {
    const normalizedMemberId = selectedMemberId.trim();

    if (!normalizedMemberId) {
      setMemberRecentSales([]);
      setMemberRecentSalesError("");
      setMemberRecentSalesLoading(false);
      return;
    }

    if (currentMemberIdRef.current !== normalizedMemberId) {
      return;
    }

    const requestId = memberRecentSalesRequestIdRef.current + 1;
    memberRecentSalesRequestIdRef.current = requestId;
    setMemberRecentSalesLoading(true);

    try {
      const data = await fetchJson<MemberRecentSalesResponse>(
        `/api/members/${normalizedMemberId}/recent-sales`
      );

      if (
        memberRecentSalesRequestIdRef.current !== requestId ||
        currentMemberIdRef.current !== normalizedMemberId
      ) {
        return;
      }

      setMemberRecentSales(data.sales);
      setMemberRecentSalesError("");
    } catch (err) {
      if (
        memberRecentSalesRequestIdRef.current !== requestId ||
        currentMemberIdRef.current !== normalizedMemberId
      ) {
        return;
      }

      setMemberRecentSales([]);
      setMemberRecentSalesError(
        err instanceof Error ? err.message : "Error cargando historial"
      );
    } finally {
      if (
        memberRecentSalesRequestIdRef.current === requestId &&
        currentMemberIdRef.current === normalizedMemberId
      ) {
        setMemberRecentSalesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const selectedMemberId = memberId;

    void Promise.resolve().then(() => {
      void loadMemberRecentSales(selectedMemberId);
    });
  }, [loadMemberRecentSales, memberId]);

  useEffect(() => {
    const selectedMemberId = memberId.trim();

    if (!selectedMemberId) {
      return;
    }

    void Promise.resolve().then(() => {
      void loadMemberOperationalData(selectedMemberId, {
        reportLoadErrors: true,
      }).catch(() => {
        // Expected load errors are reported through onMemberLoadError.
      });
    });

    return () => {
      memberStatusRequestIdRef.current += 1;
    };
  }, [loadMemberOperationalData, memberId]);

  const visibleToday = memberId ? today : emptySalesToday;

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();

    if (!q) return members;

    return members.filter((member) => {
      return (
        member.fullName.toLowerCase().includes(q) ||
        String(member.dni || "").toLowerCase().includes(q)
      );
    });
  }, [members, memberSearch]);

  const memberRecentProductNames = useMemo(() => {
    return memberRecentSales
      .filter((sale) => !sale.cancelledAt)
      .slice(0, 2)
      .map((sale) => sale.product.name);
  }, [memberRecentSales]);

  const memberRecentSummary =
    memberRecentProductNames.length === 0
      ? "Sin retiradas anteriores"
      : memberRecentProductNames.length === 1
        ? `Último retirado: ${memberRecentProductNames[0]}`
        : `Últimas retiradas: ${memberRecentProductNames.join(" · ")}`;

  function setSelectedMemberId(nextMemberId: string) {
    const normalizedMemberId = nextMemberId.trim();

    if (normalizedMemberId === currentMemberIdRef.current) {
      setMemberId(nextMemberId);
      return;
    }

    currentMemberIdRef.current = normalizedMemberId;
    memberStatusRequestIdRef.current += 1;
    memberRecentSalesRequestIdRef.current += 1;
    setToday(emptySalesToday);
    setMemberStatus(null);
    setMemberStatusLoading(Boolean(normalizedMemberId));
    setMemberRecentSales([]);
    setMemberRecentSalesError("");
    setMemberRecentSalesLoading(Boolean(normalizedMemberId));
    setMemberId(nextMemberId);
  }

  function handleMemberChange(nextMemberId: string) {
    setSelectedMemberId(nextMemberId);
  }

  function handleClearMember() {
    currentMemberIdRef.current = "";
    memberStatusRequestIdRef.current += 1;
    memberRecentSalesRequestIdRef.current += 1;
    setMemberId("");
    setMemberSearch("");
    setToday(emptySalesToday);
    setMemberStatus(null);
    setMemberStatusLoading(false);
    setMemberRecentSales([]);
    setMemberRecentSalesError("");
    setMemberRecentSalesLoading(false);
    rfidRef.current?.focus();
  }

  function setTodayForMember(selectedMemberId: string, nextToday: TodayTotals) {
    if (selectedMemberId.trim() !== currentMemberIdRef.current) return;

    setToday(nextToday);
  }

  return {
    filteredMembers,
    memberId,
    memberRecentSalesError,
    memberRecentSalesLoading,
    memberRecentSummary,
    memberSearch,
    memberStatus,
    memberStatusLoading,
    today,
    visibleToday,
    handleClearMember,
    loadMemberOperationalData,
    handleMemberChange,
    loadMemberRecentSales,
    setMemberId: setSelectedMemberId,
    setMemberSearch,
    setTodayForMember,
  };
}
