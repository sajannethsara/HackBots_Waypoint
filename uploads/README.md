# Uploaded files

Photos that users attach in the app (for now: store managers' issue photos) are saved here, as
`store/<outlet>/<date>/<id>.jpg`. The folder is committed so teammates can see the files.

This is a stand-in for object storage. Only the files are shared through git: the database rows that
link a photo to an issue stay in each developer's own database. Photos can show real shops and people,
so keep the repository private. The location can be changed with `UPLOAD_DIR`.
