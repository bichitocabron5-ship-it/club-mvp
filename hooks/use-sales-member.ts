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
  const [memberSearch, setMemberSearch] = useState("");
  const [memberRecentSales, setMemberRecentSales] = useState<
    MemberRecentSale[]
  >([]);
  const [memberRecentSalesLoading, setMemberRecentSalesLoading] =
    useState(false);
  const [memberRecentSalesError, setMemberRecentSalesError] = useState("");
  const memberRecentSalesRequestIdRef = useRef(0);

  const loadMemberRecentSales = useCallback(async (selectedMemberId: string) => {
    const normalizedMemberId = selectedMemberId.trim();
    const requestId = memberRecentSalesRequestIdRef.current + 1;
    memberRecentSalesRequestIdRef.current = requestId;

    if (!normalizedMemberId) {
      setMemberRecentSales([]);
      setMemberRecentSalesError("");
      setMemberRecentSalesLoading(false);
      return;
    }

    setMemberRecentSalesLoading(true);

    try {
      const data = await fetchJson<MemberRecentSalesResponse>(
        `/api/members/${normalizedMemberId}/recent-sales`
      );

      if (memberRecentSalesRequestIdRef.current !== requestId) return;

      setMemberRecentSales(data.sales);
      setMemberRecentSalesError("");
    } catch (err) {
      if (memberRecentSalesRequestIdRef.current !== requestId) return;

      setMemberRecentSales([]);
      setMemberRecentSalesError(
        err instanceof Error ? err.message : "Error cargando historial"
      );
    } finally {
      if (memberRecentSalesRequestIdRef.current === requestId) {
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
    if (!memberId) return;

    let cancelled = false;

    void Promise.all([
      fetchJson<TodayTotals>(`/api/members/${memberId}/today`),
      fetchJson<MemberOperationalStatus>(
        `/api/members/${memberId}/operational-status`
      ),
    ])
      .then(([todayData, statusData]) => {
        if (!cancelled) {
          setToday(todayData);
          setMemberStatus(statusData);
          onMemberLoadSuccess();
        }
      })
      .catch((err) => {
        if (!cancelled) {
          onMemberLoadError(
            err instanceof Error ? err.message : "Error cargando socio"
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [memberId, onMemberLoadError, onMemberLoadSuccess]);

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

  function handleMemberChange(nextMemberId: string) {
    setMemberId(nextMemberId);
  }

  function handleClearMember() {
    setMemberId("");
    setMemberSearch("");
    setToday(emptySalesToday);
    setMemberStatus(null);
    setMemberRecentSales([]);
    setMemberRecentSalesError("");
    setMemberRecentSalesLoading(false);
    rfidRef.current?.focus();
  }

  return {
    filteredMembers,
    memberId,
    memberRecentSalesError,
    memberRecentSalesLoading,
    memberRecentSummary,
    memberSearch,
    memberStatus,
    today,
    visibleToday,
    handleClearMember,
    handleMemberChange,
    loadMemberRecentSales,
    setMemberId,
    setMemberSearch,
    setToday,
  };
}
