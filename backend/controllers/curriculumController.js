const Curriculum = require('../models/Curriculum');

exports.getCurriculum = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const instCode = req.query.instCode || '';
    const course = req.query.course || '';
    const semester = req.query.semester || '';

    let query = {};
    if (search) {
      query.$or = [
        { subNameP1: { $regex: search, $options: 'i' } },
        { subCodeP1: { $regex: search, $options: 'i' } },
        { course: { $regex: search, $options: 'i' } }
      ];
    }
    if (instCode) query.instCode = instCode;
    if (course) query.course = course;
    if (semester) query.semester = semester;

    const total = await Curriculum.countDocuments(query);
    const totalPages = Math.ceil(total / limit) || 1;
    const items = await Curriculum.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);

    res.status(200).json({ items, total, page, totalPages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createCurriculum = async (req, res) => {
  try {
    const curriculum = new Curriculum(req.body);
    const saved = await curriculum.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateCurriculum = async (req, res) => {
  try {
    const updated = await Curriculum.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: 'Curriculum record not found' });
    res.status(200).json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteCurriculum = async (req, res) => {
  try {
    const deleted = await Curriculum.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Curriculum record not found' });
    res.status(200).json({ message: 'Curriculum record deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};