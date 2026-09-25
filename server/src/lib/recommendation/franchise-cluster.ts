/**
 * Franchise Deduplication & Canon Clustering
 * Groups related anime (sequels, prequels, movies, OVAs) using Disjoint-Set (Union-Find)
 * and selects the canonical entry-point so recommendation feeds are not flooded with multiple seasons.
 */

export interface FranchiseRelation {
  id: string
  relationType?: string // 'SEQUEL' | 'PREQUEL' | 'SIDE_STORY' | 'PARENT' | 'ALTERNATIVE' | etc.
}

export interface ClusterableCandidate {
  showId: string
  score: number
  name: string
  englishName?: string
  seasonYear?: number
  startDate?: string
  relations?: FranchiseRelation[]
  [key: string]: unknown
}

export interface ClusteredResult<T extends ClusterableCandidate> {
  main: T
  franchiseShows: T[]
  isCluster: boolean
}

export const FranchiseClusterer = {
  /**
   * Deduplicates candidates by clustering franchises and selecting the best entry point.
   */
  clusterAndDeduplicate<T extends ClusterableCandidate>(candidates: T[]): T[] {
    if (candidates.length <= 1) return candidates

    const idToCandidate = new Map<string, T>()
    for (const c of candidates) {
      idToCandidate.set(c.showId, c)
    }

    // Union-Find data structures
    const parent = new Map<string, string>()

    const find = (id: string): string => {
      let root = id
      while (parent.has(root) && parent.get(root) !== root) {
        root = parent.get(root)!
      }
      // Path compression
      let curr = id
      while (curr !== root) {
        const next = parent.get(curr) || root
        parent.set(curr, root)
        curr = next
      }
      return root
    }

    const union = (id1: string, id2: string) => {
      const root1 = find(id1)
      const root2 = find(id2)
      if (root1 !== root2) {
        parent.set(root2, root1)
      }
    }

    // Initialize each candidate as its own parent
    for (const c of candidates) {
      parent.set(c.showId, c.showId)
    }

    // Connect candidates that share relations
    for (const c of candidates) {
      if (!c.relations || !Array.isArray(c.relations)) continue

      for (const rel of c.relations) {
        const relatedId = String(rel.id)
        if (idToCandidate.has(relatedId)) {
          union(c.showId, relatedId)
        }
      }
    }

    // Group candidates by root
    const clusters = new Map<string, T[]>()
    for (const c of candidates) {
      const root = find(c.showId)
      if (!clusters.has(root)) {
        clusters.set(root, [])
      }
      clusters.get(root)!.push(c)
    }

    // Pick canonical entry for each cluster
    const deduplicated: T[] = []

    for (const [, clusterShows] of clusters.entries()) {
      if (clusterShows.length === 1) {
        deduplicated.push(clusterShows[0])
        continue
      }

      // Sort by earliest season/start date first
      const sortedByRelease = [...clusterShows].sort((a, b) => {
        const yearA = a.seasonYear || (a.startDate ? parseInt(a.startDate.slice(0, 4)) : 9999)
        const yearB = b.seasonYear || (b.startDate ? parseInt(b.startDate.slice(0, 4)) : 9999)
        if (yearA !== yearB) return yearA - yearB
        return a.showId.localeCompare(b.showId)
      })

      const earliest = sortedByRelease[0]
      let selectedMain = earliest

      // Check if any later season has a significantly higher match score (+20% higher)
      for (let i = 1; i < sortedByRelease.length; i++) {
        const later = sortedByRelease[i]
        if (later.score - earliest.score >= 20 && later.score > selectedMain.score) {
          selectedMain = later
        }
      }

      deduplicated.push(selectedMain)
    }

    // Re-sort final results by score descending
    return deduplicated.sort((a, b) => b.score - a.score)
  },
}
