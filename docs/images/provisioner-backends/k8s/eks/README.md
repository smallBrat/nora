# AWS Console screenshots — EKS setup

Reference images for the EKS setup guide. The checked-in SVGs are screenshot-style references for
the fields operators need to find in the AWS Console; replace them with manual console captures if
you need exact account-specific screenshots.

## Expected files

- `cluster-overview.svg` — EKS cluster overview. Shows the cluster name + region used by `aws eks update-kubeconfig`.
- `compute-tab.svg` — **Compute** tab confirming the managed node group is `Active` and its nodes are `Ready`.
- `add-ons.svg` — **Add-ons** showing the AWS Load Balancer Controller installed (or note EKS Auto Mode).
