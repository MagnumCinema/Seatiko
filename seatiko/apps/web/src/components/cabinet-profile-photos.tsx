"use client";

import { useRef, useState, type DragEvent } from "react";
import { CabinetConfirmDialog } from "@/components/cabinet-confirm-dialog";
import {
  FieldError,
  fill,
  LockIcon,
  PlusIcon,
  withSupportLink,
  type SiteCopy,
} from "@/components/cabinet-profile-fields";
import { ApiError, mediaUrl, removeApplicationPhoto, uploadApplicationPhoto, type VenueApplication } from "@/lib/api";
import { photoProblem } from "@/lib/cabinet-helpers";
import { MAX_VENUE_PHOTOS } from "@/lib/venue-profile";

type Upload = { id: number; name: string };

/** Venue photos: upload (several at once, drag and drop), open, delete; read-only once published. */
export function PhotosSection({
  application,
  editable,
  published,
  error,
  onApplicationChange,
  onNotice,
  onActivityChange,
  copy,
}: {
  application: VenueApplication;
  editable: boolean;
  published: boolean;
  error: string | null;
  onApplicationChange: (app: VenueApplication) => void;
  onNotice: (text: string, tone?: "success" | "error") => void;
  onActivityChange: () => void;
  copy: SiteCopy;
}) {
  const t = copy.cabinet.profileTab;
  const ui = copy.cabinet.ui;
  const photos = application.photo_urls ?? [];
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const uploadId = useRef(0);
  const busy = uploads.length > 0 || removeBusy;
  const free = MAX_VENUE_PHOTOS - photos.length;

  function uploadMessage(error: unknown) {
    if (error instanceof ApiError) {
      if (error.code === "file_too_large") return ui.photoTooLarge;
      if (error.code === "invalid_file_type") return ui.photoWrongType;
      if (error.code === "max_photos") return fill(t.photoMax, { max: MAX_VENUE_PHOTOS });
      if (error.status === 409) return t.notEditable;
    }
    return ui.photoUploadFailed;
  }

  async function upload(files: File[]) {
    if (!editable || busy || files.length === 0) return;
    if (free <= 0) {
      onNotice(fill(t.photoMax, { max: MAX_VENUE_PHOTOS }), "error");
      return;
    }
    const bad = files.map((file) => photoProblem(file)).find(Boolean);
    const good = files.filter((file) => !photoProblem(file));
    const batch = good.slice(0, free);
    const queued = batch.map((file) => ({ id: (uploadId.current += 1), name: file.name }));
    setUploads(queued);
    let added = 0;
    let failure: string | null = null;
    for (const [index, file] of batch.entries()) {
      try {
        const updated = await uploadApplicationPhoto(application.id, file);
        onApplicationChange(updated);
        added += 1;
      } catch (problem) {
        failure = uploadMessage(problem);
        if (problem instanceof ApiError && (problem.code === "max_photos" || problem.status === 409)) break;
      } finally {
        setUploads((current) => current.filter((item) => item.id !== queued[index].id));
      }
    }
    setUploads([]);
    if (added) onActivityChange();
    const addedText = added ? fill(t.photosAdded, { n: added }) : "";
    const skipped = failure ?? (bad === "size" ? ui.photoTooLarge : bad === "type" ? ui.photoWrongType : null);
    if (skipped) onNotice(addedText ? `${addedText}. ${skipped}` : skipped, "error");
    else if (good.length > batch.length) onNotice(fill(t.photoLimitCut, { max: MAX_VENUE_PHOTOS, n: added }), "error");
    else if (added) onNotice(addedText);
  }

  async function remove(url: string) {
    setRemoveBusy(true);
    try {
      const updated = await removeApplicationPhoto(application.id, url);
      onApplicationChange(updated);
      onActivityChange();
      onNotice(ui.photoRemoved);
    } catch (problem) {
      onNotice(problem instanceof ApiError && problem.status === 409 ? t.notEditable : ui.photoRemoveFailed, "error");
    } finally {
      setRemoveBusy(false);
      setRemoving(null);
    }
  }

  const dropProps = editable
    ? {
        onDragOver: (event: DragEvent) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDragging(true);
        },
        onDragLeave: (event: DragEvent) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        },
        onDrop: (event: DragEvent) => {
          event.preventDefault();
          setDragging(false);
          void upload(Array.from(event.dataTransfer.files));
        },
      }
    : {};

  return (
    <div className="owner-form-section">
      <div className="owner-form-title">
        <span>05</span>
        <div>
          <h3>
            {t.photosTitle} <span className="vp-count">{fill(t.photosCount, { n: photos.length, max: MAX_VENUE_PHOTOS })}</span>
          </h3>
          <p>{t.photosHint}</p>
        </div>
      </div>
      <div className={`owner-photo-area vp-photos${dragging ? " dragging" : ""}`} id="venue-photos" tabIndex={-1} {...dropProps}>
        {photos.length === 0 && uploads.length === 0 && !editable ? (
          <p className="vp-empty-value">{t.photosEmpty}</p>
        ) : (
          <div className="photo-grid owner-photo-grid">
            {photos.map((url, index) => (
              <div key={url} className="photo-thumb owner-photo-thumb">
                <a href={mediaUrl(url)} target="_blank" rel="noreferrer" aria-label={fill(t.openPhoto, { n: index + 1 })}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(url)} alt={ui.photoAlt.replace("{n}", String(index + 1))} loading="lazy" />
                </a>
                {index === 0 && <span>{copy.cabinet.cover}</span>}
                {editable && (
                  <button type="button" aria-label={`${ui.deletePhoto} ${index + 1}`} title={ui.deletePhoto} disabled={busy} onClick={() => setRemoving(url)}>
                    ×
                  </button>
                )}
              </div>
            ))}
            {uploads.map((item) => (
              <div key={item.id} className="vp-upload-tile" role="status" title={item.name}>
                <i className="owner-inline-spinner" aria-hidden="true" />
                <small>{t.uploading}</small>
              </div>
            ))}
            {editable && photos.length + uploads.length < MAX_VENUE_PHOTOS && (
              <label className={`owner-photo-upload${busy ? " disabled" : ""}`}>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(event) => {
                    void upload(Array.from(event.target.files ?? []));
                    event.target.value = "";
                  }}
                />
                <span aria-hidden="true"><PlusIcon /></span>
                <strong>{t.addPhotos}</strong>
                <small>{t.dropHint}</small>
                <small>{ui.photoFormats}</small>
              </label>
            )}
          </div>
        )}
        {error && <FieldError id="venue-photos-error">{error}</FieldError>}
        {editable && photos.length > 1 && <p className="owner-field-hint">{t.coverHint}</p>}
        {published && (
          <p className="vp-note">
            <LockIcon />
            <span>{withSupportLink(t.photosPublishedNote)}</span>
          </p>
        )}
      </div>
      <CabinetConfirmDialog
        open={removing !== null}
        title={ui.deletePhotoTitle}
        text={ui.deletePhotoText}
        confirmLabel={ui.deletePhoto}
        cancelLabel={copy.cabinet.opsMenuCancel}
        busy={removeBusy}
        onConfirm={() => removing && void remove(removing)}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
