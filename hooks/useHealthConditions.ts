import { useState, useEffect, useCallback } from 'react'
import { fetchHealthConditions, insertHealthCondition, deleteHealthCondition, type HealthCondition } from '@/lib/diaryApi'

export type { HealthCondition }

export const useHealthConditions = () => {
  const [conditions, setConditions] = useState<HealthCondition[]>([])
  const [loading, setLoading] = useState(true)

  // 从 Supabase 加载数据
  const loadConditions = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchHealthConditions()
      setConditions(data)
    } catch (error) {
      console.error('Failed to load health conditions:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // 组件挂载时加载数据
  useEffect(() => {
    loadConditions()
  }, [loadConditions])

  const addCondition = useCallback(async (condition: Omit<HealthCondition, 'id' | 'created_at'>) => {
    try {
      const newCondition = await insertHealthCondition(condition)
      setConditions(prev => [newCondition, ...prev])
    } catch (error) {
      console.error('Failed to add health condition:', error)
      throw error
    }
  }, [])

  const deleteConditionById = useCallback(async (id: string) => {
    try {
      await deleteHealthCondition(id)
      setConditions(prev => prev.filter(c => c.id !== id))
    } catch (error) {
      console.error('Failed to delete health condition:', error)
      throw error
    }
  }, [])

  const getConditionForDate = useCallback((date: Date) => {
    return conditions.find(c => {
      const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      const startDate = new Date(c.startDate.getFullYear(), c.startDate.getMonth(), c.startDate.getDate())
      const endDate = new Date(c.endDate.getFullYear(), c.endDate.getMonth(), c.endDate.getDate())
      return checkDate >= startDate && checkDate <= endDate
    })
  }, [conditions])

  const getAllConditionsForDate = useCallback((date: Date) => {
    return conditions.filter(c => {
      const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      const startDate = new Date(c.startDate.getFullYear(), c.startDate.getMonth(), c.startDate.getDate())
      const endDate = new Date(c.endDate.getFullYear(), c.endDate.getMonth(), c.endDate.getDate())
      return checkDate >= startDate && checkDate <= endDate
    })
  }, [conditions])

  return {
    conditions,
    loading,
    addCondition,
    deleteCondition: deleteConditionById,
    getConditionForDate,
    getAllConditionsForDate,
    refresh: loadConditions
  }
}
